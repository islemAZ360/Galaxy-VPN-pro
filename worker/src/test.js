import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile, exec } from 'node:child_process';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parseConfig, renameConfig } from './uri.js';
import { log } from './log.js';

const execAsync = promisify(exec);

async function cleanupNetwork() {
  if (process.platform === 'win32') {
    try {
      await execAsync('taskkill /F /IM xray-knife.exe /IM xray.exe /IM sing-box.exe /IM v2ray.exe /T').catch(() => {});
      await execAsync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f').catch(() => {});
    } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// REAL protocol testing via xray-knife (https://github.com/lilendian0x00/xray-knife)
//
// Why: a TCP connect only proves the port is reachable — NOT that the VLESS/
// VMess/Trojan/Reality handshake actually passes through (e.g. Russia's DPI).
// xray-knife bundles xray-core + sing-box and does a real connection + URL test,
// the same quality as Hiddify. RUN THIS WORKER FROM RUSSIA so the results reflect
// what Russian users actually get.
//
// Set XRAY_KNIFE_PATH to the binary (e.g. C:\tools\xray-knife.exe). If it isn't
// found, we fall back to a TCP-reachability check so the pipeline still runs.
// ---------------------------------------------------------------------------
const XK_PATH = process.env.XRAY_KNIFE_PATH || 'xray-knife';
const XK_CORE = process.env.XRAY_KNIFE_CORE || 'xray'; // auto | singbox | xray
const XK_URL = process.env.XRAY_KNIFE_URL || 'https://cloudflare.com/cdn-cgi/trace';
const XK_MDELAY = process.env.XRAY_KNIFE_MDELAY || '5000'; // max acceptable delay (ms)

function tcpPing(host, port, timeoutMs) {
  return new Promise((resolve) => {
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return resolve({ ok: false, latencyMs: null });
    }
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ ok, latencyMs: ok ? Date.now() - start : null });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    try {
      sock.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

export async function testConfig(uri, timeoutMs = 4000) {
  const { host, port, name } = parseConfig(uri);
  const r = await tcpPing(host, port, timeoutMs);
  return { uri, host, port, name, ok: r.ok, latencyMs: r.latencyMs };
}

// Run xray-knife over a file of configs; returns the subset that PASSED the real
// test. Throws { enoent: true } if the binary isn't installed.
function runXrayKnife(inFile, outFile, threads, url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = [
      'http',
      '-f', inFile,
      '-o', outFile,
      '-x', 'csv', // CSV (link,status,…,delay,…,location,…) — one pass gives
                   // pass/fail + latency + egress country, no extra runs needed

      '-t', String(threads),
      '-d', String(timeoutMs || XK_MDELAY),
      '-z', XK_CORE,
      '-u', url || XK_URL, // custom test target (e.g. a Gemini endpoint) or default
    ];
    execFile(XK_PATH, args, { timeout: 30 * 60 * 1000, maxBuffer: 128 * 1024 * 1024 }, (err) => {
      if (err && err.code === 'ENOENT') {
        return reject(Object.assign(new Error('xray-knife not found'), { enoent: true }));
      }
      if (err && err.code && err.code !== 1) {
        // Log unexpected errors (e.g. EACCES, SIGKILL) that might indicate Termux issues
        log.warn(`xray-knife execution issue: ${err.message} (code: ${err.code}, signal: ${err.signal})`);
      }
      // xray-knife may exit non-zero when some configs fail — that's fine, the
      // valid ones are still written to outFile. Resolve regardless.
      resolve();
    });
  });
}

// Pure TCP-reachability batch (fallback when xray-knife is unavailable or for latency testing).
export async function tcpTestAll(uris, { concurrency, timeoutMs }) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, uris.length) }, async () => {
    while (i < uris.length) {
      const idx = i++;
      try {
        results[idx] = await testConfig(uris[idx], timeoutMs);
      } catch {
        results[idx] = { uri: uris[idx], host: null, port: NaN, name: null, ok: false, latencyMs: null };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// name-independent key so xray-knife's CSV `link` column matches our input URIs
// even if the display name was normalized.
const keyOf = (u) => renameConfig(u, '');

// Parse one CSV line, honoring quoted fields with embedded commas / "" escapes.
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// xray-knife may print delay as "1234", "1234ms", or "1.23s" — normalize to ms.
function parseDelayMs(raw) {
  if (raw == null) return null;
  const m = String(raw).trim().toLowerCase().match(/([\d.]+)\s*(ms|µs|us|s)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  if (m[2] === 's') return Math.round(n * 1000);
  if (m[2] === 'µs' || m[2] === 'us') return Math.round(n / 1000);
  return Math.round(n); // ms or unitless
}

// xray-knife `http -x csv` columns:
//   link,status,reason,tls,ip,delay,code,download,upload,location,ttfb,connect_time
// → Map(keyOf(link) -> { alive, delayMs, location }).
function parseXkCsv(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) { // row 0 is the header
    if (!lines[i]) continue;
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const status = cols[1];
    const alive = status === 'passed' || status === 'semi-passed';
    const delayMs = cols.length > 5 ? parseDelayMs(cols[5]) : null;
    const locRaw = cols.length > 9 ? cols[9] : '';
    const location = locRaw && locRaw !== 'null' ? locRaw.toUpperCase() : null;
    map.set(keyOf(cols[0]), { alive, delayMs, location });
  }
  return map;
}

// Which configs are SAFE to TCP-pre-filter: only confirmed TCP transports. UDP
// transports (hysteria/tuic, or vless/vmess over kcp/quic) would be wrongly
// dropped by a TCP probe, so they bypass the filter. Anything we can't classify
// confidently also bypasses — we never risk losing a working server for speed.
function isTcpPrefilterable(uri) {
  const scheme = (uri.split('://')[0] || '').toLowerCase();
  if (['hysteria', 'hysteria2', 'hy2', 'tuic', 'juicity', 'wireguard', 'wg'].includes(scheme)) return false;
  try {
    if (scheme === 'vmess') {
      const json = JSON.parse(Buffer.from(uri.slice('vmess://'.length), 'base64').toString('utf8'));
      const net = String(json.net || '').toLowerCase();
      return net !== 'kcp' && net !== 'quic';
    }
    const q = uri.includes('?') ? uri.slice(uri.indexOf('?') + 1).split('#')[0] : '';
    const type = (new URLSearchParams(q).get('type') || '').toLowerCase();
    return type !== 'kcp' && type !== 'quic';
  } catch {
    return false;
  }
}

// Fast reachability sweep: drop hosts that can't even TCP-connect BEFORE paying
// xray-knife's full handshake (up to MDELAY) on each dead one. Generous timeout
// so slow-but-alive hosts survive. Disable with TCP_PREFILTER=0.
async function tcpPrefilter(uris) {
  if (process.env.TCP_PREFILTER === '0') return uris;
  const conc = Number(process.env.TCP_PREFILTER_CONC) || Math.min(150, (Number(process.env.TEST_CONCURRENCY) || 50) * 2);
  const timeoutMs = Number(process.env.TCP_PREFILTER_TIMEOUT_MS) || 2500;

  const eligible = [];
  const bypass = [];
  for (const u of uris) (isTcpPrefilterable(u) ? eligible : bypass).push(u);
  if (eligible.length === 0) return uris;

  const reachable = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(conc, eligible.length) }, async () => {
      while (i < eligible.length) {
        const u = eligible[i++];
        const { host, port } = parseConfig(u);
        const r = await tcpPing(host, port, timeoutMs);
        if (r.ok) reachable.push(u);
      }
    })
  );
  const kept = reachable.length + bypass.length;
  // Progress bar is active in the caller, so we don't log.info here to avoid flickering.
  return [...reachable, ...bypass];
}

// Main entry used by sync.js. ONE xray-knife `-x csv` pass yields pass/fail +
// latency (delay) + egress country (location) — so callers need no separate
// latency re-ping, and the Gemini step rarely needs a second run. Falls back to
// a TCP-only check if the binary is missing.
export async function testAll(uris, { concurrency = 50, timeoutMs = 4000, url } = {}) {
  if (uris.length === 0) return [];

  const pool = await tcpPrefilter(uris);
  if (pool.length === 0) return [];

  let rows = null; // Map(keyOf(uri) -> { alive, delayMs, location })
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gv-xk-'));
  const inFile = path.join(dir, 'configs.txt');
  const outFile = path.join(dir, 'valid.csv');
  try {
    await writeFile(inFile, pool.join('\n'), 'utf8');
    await runXrayKnife(inFile, outFile, concurrency, url, timeoutMs);
    const text = await readFile(outFile, 'utf8').catch(() => '');
    rows = parseXkCsv(text);
  } catch (e) {
    if (e.enoent) {
      log.warn(
        'xray-knife not found — falling back to TCP reachability (weaker). ' +
          'Install xray-knife and set XRAY_KNIFE_PATH for real, Russia-accurate testing.'
      );
    } else {
      log.err(`xray-knife failed, falling back to TCP: ${e.message}`);
    }
    rows = null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await cleanupNetwork();
  }

  // Fallback: TCP-only over the pre-filtered pool (weaker — no DPI guarantee).
  if (rows === null) {
    return tcpTestAll(pool, { concurrency, timeoutMs });
  }

  // Build the working set straight from the CSV — latency (delayMs) and egress
  // country (exitCc) come for free, no second network round.
  const byKey = new Map(pool.map((u) => [keyOf(u), u]));
  const results = [];
  for (const [k, info] of rows) {
    if (!info.alive) continue;
    const uri = byKey.get(k);
    if (!uri) continue;
    const { host, port, name } = parseConfig(uri);
    results.push({ uri, host, port, name, ok: true, latencyMs: info.delayMs, exitCc: info.location });
  }
  return results;
}
