import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { renameConfig } from './uri.js';
import { log } from './log.js';

// ---------------------------------------------------------------------------
// REAL Gemini availability check — FAST.
//
// THE ORIGINAL BUG: the old re-check asked xray-knife to merely *reach* a Google
// URL. That endpoint answers from EVERY country (incl. RU/CN/HK where Gemini is
// blocked) and xray-knife never read the body — so every working server falsely
// passed.
//
// WHAT ACTUALLY DECIDES GEMINI: the EGRESS COUNTRY of the tunnel. Gemini's API
// returns HTTP 400 "User location is not supported for the API use." when the
// exit IP sits in an unsupported region; otherwise (supported region) the same
// invalid-key request returns HTTP 400 "API key not valid". NOTE both are 400,
// so the status code alone can't tell them apart — the COUNTRY does.
//
// FAST PATH (Stage 1): one batched `xray-knife http -x csv` run tests the whole
// pool with many threads and reports, per config, whether it connects AND its
// real egress country (the `location` column, resolved THROUGH the tunnel). We
// classify by that country — instant, no per-config process.
//
// PRECISE PATH (Stage 2): a minority of servers connect but xray-knife can't
// resolve their egress country (`ip_info_failed`). Only those fall through to a
// real per-config probe: run the config as a local proxy, call the Gemini API
// through it, and read the body for the geo-block phrase.
// ---------------------------------------------------------------------------

const XK_PATH = process.env.XRAY_KNIFE_PATH || 'xray-knife';
const XK_CORE = process.env.XRAY_KNIFE_CORE || 'singbox'; // auto | singbox | xray

// Invalid key on purpose — we only care which 400 comes back (key vs location),
// but the FAST path keys off the egress country, not the body.
const GEMINI_PROBE_URL =
  process.env.GEMINI_PROBE_URL ||
  'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyA00000000000000000000000000000000000';

const BLOCK_SIGNAL = process.env.GEMINI_BLOCK_SIGNAL || 'User location is not supported';

// Stage 1 (batched http) tuning. High thread count + a tight max-delay is the
// whole speed story: dead servers cost at most BATCH_MDELAY each, amortized over
// BATCH_THREADS parallel slots.
const BATCH_THREADS = Number(process.env.GEMINI_BATCH_THREADS || 80);
const BATCH_MDELAY = Number(process.env.GEMINI_BATCH_MDELAY_MS || 7000);
const BATCH_CHUNK = Number(process.env.GEMINI_BATCH_CHUNK || 500);

// Stage 2 (per-config probe) — forces a NO-AUTH SOCKS5 inbound (xray-knife v10's
// default inbound otherwise demands a random user/pass). Override per version.
const PROXY_ARGS_TMPL =
  process.env.XRAY_KNIFE_PROXY_ARGS || 'proxy inbound -c {URI} -I socks://127.0.0.1:{PORT}';
const PROXY_SCHEME = (process.env.GEMINI_PROXY_SCHEME || 'socks5').toLowerCase();
const BASE_PORT = Number(process.env.GEMINI_PROXY_BASE_PORT || 21100);

// Egress countries where Gemini is unavailable. Everything else is treated as
// supported (Gemini covers 180+ countries, so a blocklist is the safe shape).
const BLOCKED_CC = new Set(
  (process.env.GEMINI_BLOCKED_CC || 'RU,CN,HK,MO,BY,IR,KP,SY,CU')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (u) => renameConfig(u, ''); // strip display name → stable match key

export function isCountryGeminiBlocked(cc) {
  if (!cc) return false;
  return BLOCKED_CC.has(String(cc).toUpperCase());
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ====================== STAGE 1 — batched CSV classify ======================

// Parse one CSV line, honoring quoted fields with embedded commas / "" escapes.
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Run xray-knife http on a batch; return Map(key → {alive, code, location}).
// columns: link,status,reason,tls,ip,delay,code,download,upload,location,ttfb,connect_time
function runBatch(uris) {
  return new Promise(async (resolve) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gv-gem-'));
    const inFile = path.join(dir, 'in.txt');
    const outFile = path.join(dir, 'out.csv');
    const map = new Map();
    try {
      await writeFile(inFile, uris.join('\n'), 'utf8');
      await new Promise((done) => {
        execFile(
          XK_PATH,
          ['http', '-f', inFile, '-u', GEMINI_PROBE_URL, '-x', 'csv', '-o', outFile,
            '-t', String(BATCH_THREADS), '-d', String(BATCH_MDELAY), '-z', XK_CORE],
          { timeout: 30 * 60 * 1000, maxBuffer: 256 * 1024 * 1024 },
          (err) => { if (err && err.code === 'ENOENT') map.set('__enoent__', true); done(); }
        );
      });
      const text = await readFile(outFile, 'utf8').catch(() => '');
      const lines = text.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 11) continue;
        const [link, status] = cols;
        const code = Number(cols[6]);
        const loc = cols[9];
        map.set(keyOf(link), {
          alive: status === 'passed' || status === 'semi-passed',
          code,
          location: loc && loc !== 'null' ? loc.toUpperCase() : null,
        });
      }
    } catch (e) {
      log.warn(`Gemini batch run failed: ${e.message}`);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    resolve(map);
  });
}

// ====================== STAGE 2 — precise per-config probe ===================

function buildProxyArgs(uri, port) {
  return PROXY_ARGS_TMPL.trim().split(/\s+/).map((t) => t.replace('{URI}', uri).replace('{PORT}', String(port)));
}

function parseCreds(stdout) {
  const u = stdout.match(/Username:\s*(\S+)/);
  const p = stdout.match(/Password:\s*(\S+)/);
  return u && p ? { user: u[1], pass: p[1] } : null;
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        s.destroy();
        if (ok) return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tryOnce, 150);
      };
      s.setTimeout(800);
      s.once('connect', () => finish(true));
      s.once('timeout', () => finish(false));
      s.once('error', () => finish(false));
    };
    tryOnce();
  });
}

function socks5Connect(proxyPort, destHost, destPort, timeoutMs, creds) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, '127.0.0.1');
    let stage = 'greet';
    let buf = Buffer.alloc(0);
    const fail = (e) => { sock.destroy(); reject(e instanceof Error ? e : new Error(String(e))); };
    const sendConnect = () => {
      stage = 'connect';
      buf = Buffer.alloc(0);
      const h = Buffer.from(destHost, 'utf8');
      sock.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, h.length]), h, Buffer.from([(destPort >> 8) & 0xff, destPort & 0xff])]));
    };
    sock.setTimeout(timeoutMs, () => fail(new Error('socks5 timeout')));
    sock.once('error', fail);
    sock.on('connect', () => sock.write(creds ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00])));
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 'greet') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05) return fail(new Error('bad socks version'));
        const method = buf[1];
        if (method === 0x00) return sendConnect();
        if (method === 0x02 && creds) {
          stage = 'auth';
          buf = Buffer.alloc(0);
          const u = Buffer.from(creds.user, 'utf8');
          const p = Buffer.from(creds.pass, 'utf8');
          sock.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]));
          return;
        }
        return fail(new Error(`socks5 auth method rejected (0x${method.toString(16)})`));
      }
      if (stage === 'auth') {
        if (buf.length < 2) return;
        if (buf[1] !== 0x00) return fail(new Error('socks5 user/pass rejected'));
        return sendConnect();
      }
      if (stage === 'connect') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) return fail(new Error(`socks5 connect failed (code ${buf[1]})`));
        stage = 'done';
        sock.removeAllListeners('data');
        sock.setTimeout(0);
        resolve(sock);
      }
    });
  });
}

function httpConnect(proxyPort, destHost, destPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, '127.0.0.1');
    let buf = '';
    const fail = (e) => { sock.destroy(); reject(e instanceof Error ? e : new Error(String(e))); };
    sock.setTimeout(timeoutMs, () => fail(new Error('http-connect timeout')));
    sock.once('error', fail);
    sock.on('connect', () => sock.write(`CONNECT ${destHost}:${destPort} HTTP/1.1\r\nHost: ${destHost}:${destPort}\r\n\r\n`));
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      if (!buf.includes('\r\n\r\n')) return;
      const ok = /^HTTP\/\d\.\d\s+2\d\d/.test(buf);
      sock.removeAllListeners('data');
      sock.setTimeout(0);
      if (!ok) return fail(new Error('http-connect refused: ' + buf.split('\r\n')[0]));
      resolve(sock);
    });
  });
}

function tunnelConnect(proxyPort, destHost, destPort, timeoutMs, creds) {
  return PROXY_SCHEME === 'http'
    ? httpConnect(proxyPort, destHost, destPort, timeoutMs)
    : socks5Connect(proxyPort, destHost, destPort, timeoutMs, creds);
}

async function httpsGetThroughTunnel(proxyPort, urlStr, timeoutMs, creds) {
  const u = new URL(urlStr);
  const destPort = u.port ? Number(u.port) : 443;
  const raw = await tunnelConnect(proxyPort, u.hostname, destPort, timeoutMs, creds);
  return await new Promise((resolve, reject) => {
    const cleanup = () => { try { tlsSock.destroy(); } catch {} try { raw.destroy(); } catch {} };
    const tlsSock = tls.connect(
      { socket: raw, servername: u.hostname, ALPNProtocols: ['http/1.1'], rejectUnauthorized: false },
      () => {
        tlsSock.write(
          `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.hostname}\r\n` +
            `User-Agent: Mozilla/5.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`
        );
      }
    );
    let buf = '';
    const finish = (err) => {
      cleanup();
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      const statusLine = buf.split('\r\n')[0] || '';
      const m = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
      resolve({ status: m ? Number(m[1]) : 0, raw: buf });
    };
    tlsSock.setTimeout(timeoutMs, () => finish(new Error('https timeout')));
    tlsSock.once('error', finish);
    tlsSock.on('data', (d) => { buf += d.toString('utf8'); if (buf.length > 64 * 1024) finish(null); });
    tlsSock.on('end', () => finish(null));
    tlsSock.on('close', () => finish(null));
  });
}

function classify({ status, raw }) {
  if (/User location is not supported/i.test(raw) || (BLOCK_SIGNAL && raw.includes(BLOCK_SIGNAL))) return 'blocked';
  if (/FAILED_PRECONDITION/.test(raw) && /location/i.test(raw)) return 'blocked';
  if (status === 400 && /API[_ ]?key not valid|API_KEY_INVALID/i.test(raw)) return 'available';
  if (status >= 200 && status < 500) return 'available';
  return 'unknown';
}

async function probeOne(uri, port, { spawnTimeoutMs, probeTimeoutMs }) {
  const args = buildProxyArgs(uri, port);
  const child = spawn(XK_PATH, args, { windowsHide: true });
  let spawnErr = null;
  let outBuf = '';
  child.on('error', (e) => { spawnErr = e; });
  child.stdout?.on('data', (d) => { if (outBuf.length < 8192) outBuf += d.toString(); });
  child.stderr?.on('data', (d) => { if (outBuf.length < 8192) outBuf += d.toString(); });
  const kill = () => { try { child.kill('SIGKILL'); } catch {} };
  try {
    const up = await waitForPort(port, spawnTimeoutMs);
    if (spawnErr) return { ok: false, verdict: 'spawn-error' };
    if (!up) return { ok: false, verdict: 'proxy-not-up' };
    const res = await httpsGetThroughTunnel(port, GEMINI_PROBE_URL, probeTimeoutMs, parseCreds(outBuf));
    const verdict = classify(res);
    return { ok: verdict === 'available', verdict };
  } catch (e) {
    return { ok: false, verdict: 'probe-error' };
  } finally {
    kill();
  }
}

// Per-config precise probe over a (small) set of configs. Returns [{uri,ok,verdict}].
export async function geminiCheckAll(uris, opts = {}) {
  const { concurrency = 12, spawnTimeoutMs = 6000, probeTimeoutMs = 8000 } = opts;
  const results = new Array(uris.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, uris.length));
  await Promise.all(
    Array.from({ length: workerCount }, async (_, w) => {
      const port = BASE_PORT + w;
      while (true) {
        const idx = next++;
        if (idx >= uris.length) break;
        const uri = uris[idx];
        let r = await probeOne(uri, port, { spawnTimeoutMs, probeTimeoutMs });
        // Only retry a failed *setup* (port never opened) — a real timeout won't recover.
        if (!r.ok && r.verdict === 'proxy-not-up') {
          await sleep(250);
          r = await probeOne(uri, port, { spawnTimeoutMs, probeTimeoutMs });
        }
        results[idx] = { uri, ok: r.ok, verdict: r.verdict };
      }
    })
  );
  return results;
}

// ====================== ORCHESTRATOR ========================================

/**
 * Classify a whole pool for Gemini availability. Fast batched country pass
 * first, precise per-config probe only for servers whose egress country the
 * batch couldn't resolve.
 *
 * @param {string[]} uris
 * @param {object} opts
 * @param {(pct:number,label:string)=>void} [opts.onProgress]
 * @param {number} [opts.probeConcurrency=12]
 * @returns {Promise<{uri:string, ok:boolean, verdict:string}[]>}
 */
export async function classifyGeminiPool(uris, opts = {}) {
  const { onProgress, probeConcurrency = Number(process.env.GEMINI_PROBE_CONCURRENCY || 12) } = opts;
  if (uris.length === 0) return [];

  // ---- Stage 1: batched connectivity + egress country ----
  const info = new Map();
  let enoent = false;
  const batches = chunk(uris, BATCH_CHUNK);
  let done = 0;
  for (const b of batches) {
    const m = await runBatch(b);
    if (m.get('__enoent__')) enoent = true;
    for (const [k, v] of m) if (k !== '__enoent__') info.set(k, v);
    done += b.length;
    onProgress?.((done / uris.length) * 60, `country pass ${done}/${uris.length}`);
    
    // Short cooling delay between batches — only Windows needs it; skip elsewhere.
    if (process.platform === 'win32' && done < uris.length) await sleep(1000);
  }
  if (enoent) {
    log.err(`xray-knife not found at "${XK_PATH}" — cannot run the Gemini check. Set XRAY_KNIFE_PATH.`);
    return uris.map((uri) => ({ uri, ok: false, verdict: 'no-binary' }));
  }

  const results = [];
  const needProbe = [];
  for (const uri of uris) {
    const m = info.get(keyOf(uri));
    if (!m || !m.alive) { results.push({ uri, ok: false, verdict: 'dead' }); continue; }
    if (m.location && isCountryGeminiBlocked(m.location)) { results.push({ uri, ok: false, verdict: `blocked-${m.location}` }); continue; }
    if (m.location) { results.push({ uri, ok: true, verdict: `country-${m.location}` }); continue; }
    needProbe.push(uri); // alive but country unknown → precise probe
  }

  // ---- Stage 2: precise probe for unknown-country survivors ----
  if (needProbe.length) {
    log.info(`Gemini: ${needProbe.length} server(s) need a precise probe (egress country unknown)…`);
    const probed = [];
    const subBatches = chunk(needProbe, 60);
    let p = 0;
    for (const sb of subBatches) {
      const r = await geminiCheckAll(sb, { concurrency: probeConcurrency });
      probed.push(...r);
      p += sb.length;
      onProgress?.(60 + (p / needProbe.length) * 40, `precise probe ${p}/${needProbe.length}`);
    }
    results.push(...probed);
  }

  // Verdict histogram — surfaces systemic failures instead of a silent 0.
  const hist = {};
  for (const r of results) {
    const key = /^(country|blocked|available)-/.test(r.verdict) ? r.verdict.split('-')[0] : r.verdict;
    hist[key] = (hist[key] || 0) + 1;
  }
  log.info(`Gemini verdicts: ${Object.entries(hist).map(([k, v]) => `${k}=${v}`).join(' ')}`);

  return results;
}
