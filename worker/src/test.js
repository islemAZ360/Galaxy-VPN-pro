import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile, exec } from 'node:child_process';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parseConfig } from './uri.js';
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
const XK_CORE = process.env.XRAY_KNIFE_CORE || 'auto'; // auto | singbox | xray
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
function runXrayKnife(inFile, outFile, threads, url) {
  return new Promise((resolve, reject) => {
    const args = [
      'http',
      '-f', inFile,
      '-o', outFile,
      '-x', 'txt', // output valid configs, one per line, sorted fast→slow
      '-t', String(threads),
      '-d', String(XK_MDELAY),
      '-z', XK_CORE,
      '-u', url || XK_URL, // custom test target (e.g. a Gemini endpoint) or default
    ];
    execFile(XK_PATH, args, { timeout: 30 * 60 * 1000, maxBuffer: 128 * 1024 * 1024 }, (err) => {
      if (err && err.code === 'ENOENT') {
        return reject(Object.assign(new Error('xray-knife not found'), { enoent: true }));
      }
      // xray-knife may exit non-zero when some configs fail — that's fine, the
      // valid ones are still written to outFile. Resolve regardless.
      resolve();
    });
  });
}

// Pure TCP-reachability batch (fallback when xray-knife is unavailable).
async function tcpTestAll(uris, { concurrency, timeoutMs }) {
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

// Main entry used by sync.js. Real test first, TCP fallback.
export async function testAll(uris, { concurrency = 50, timeoutMs = 4000, url } = {}) {
  if (uris.length === 0) return [];

  let workingUris = null;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gv-xk-'));
  const inFile = path.join(dir, 'configs.txt');
  const outFile = path.join(dir, 'valid.txt');
  try {
    await writeFile(inFile, uris.join('\n'), 'utf8');
    await runXrayKnife(inFile, outFile, concurrency, url);
    const text = await readFile(outFile, 'utf8').catch(() => '');
    workingUris = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /:\/\//.test(s));
    log.ok(`xray-knife: ${workingUris.length}/${uris.length} configs passed the real test`);
  } catch (e) {
    if (e.enoent) {
      log.warn(
        'xray-knife not found — falling back to TCP reachability (weaker). ' +
          'Install xray-knife and set XRAY_KNIFE_PATH for real, Russia-accurate testing.'
      );
    } else {
      log.err(`xray-knife failed, falling back to TCP: ${e.message}`);
    }
    workingUris = null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await cleanupNetwork();
  }

  // Fallback path
  if (workingUris === null) {
    return tcpTestAll(uris, { concurrency, timeoutMs });
  }

  // For the (small) working set, get a latency number for ordering/display.
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, workingUris.length) }, async () => {
    while (i < workingUris.length) {
      const uri = workingUris[i++];
      const { host, port, name } = parseConfig(uri);
      const r = await tcpPing(host, port, timeoutMs);
      results.push({ uri, host, port, name, ok: true, latencyMs: r.latencyMs });
    }
  });
  await Promise.all(workers);
  return results;
}
