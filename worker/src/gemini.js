import net from 'node:net';
import tls from 'node:tls';
import { spawn } from 'node:child_process';
import { log } from './log.js';

// ---------------------------------------------------------------------------
// REAL Gemini availability probe.
//
// THE BUG THIS FIXES: the old "Gemini re-check" just asked xray-knife to
// *reach* https://generativelanguage.googleapis.com/ . That bare endpoint is
// reachable from EVERY country on earth (incl. Russia/China/HK where Gemini is
// geo-blocked) and xray-knife only measures "did the request connect + how
// fast" — it never reads the response body. So every working proxy "passed",
// and none of them actually worked with Gemini.
//
// THE FIX: run each candidate config as a *local proxy* (xray-knife proxy),
// then make a REAL request to the Gemini API through that tunnel and READ THE
// BODY. The geo-gate is unambiguous:
//   • supported region -> HTTP 400  "API key not valid"  (we sent a fake key,
//                                     but the request got PAST the geo gate)
//   • blocked region   -> HTTP 403  "User location is not supported for the
//                                     API use."
// We only keep a server if its tunnel lands in a supported region.
//
// NOTE ON THE PROXY LISTENER: xray-knife v10's `proxy inbound` opens a SOCKS5
// listener that REQUIRES a random username/password by default. We force a
// no-auth listener by passing the inbound link explicitly
// (`-I socks://127.0.0.1:PORT`). The SOCKS5 client below still negotiates
// user/pass as a fallback (parsed from xray-knife's stdout) so custom proxy
// templates keep working.
// ---------------------------------------------------------------------------

const XK_PATH = process.env.XRAY_KNIFE_PATH || 'xray-knife';

// We hit the models endpoint with a deliberately-invalid key. The key being
// wrong is fine — we only care WHICH error comes back (geo vs key).
const GEMINI_PROBE_URL =
  process.env.GEMINI_PROBE_URL ||
  'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyA00000000000000000000000000000000000';

// The exact phrase Google returns when the egress IP is in an unsupported region.
const BLOCK_SIGNAL = process.env.GEMINI_BLOCK_SIGNAL || 'User location is not supported';

// How we ask xray-knife to expose a single config as a local proxy. {URI} and
// {PORT} are substituted. Default forces a NO-AUTH SOCKS5 inbound (verified on
// xray-knife v10). Override for other versions, e.g.:
//   older builds:  proxy -c {URI} --inbound socks5://127.0.0.1:{PORT}
const PROXY_ARGS_TMPL =
  process.env.XRAY_KNIFE_PROXY_ARGS || 'proxy inbound -c {URI} -I socks://127.0.0.1:{PORT}';

// What kind of inbound the command above opens: 'socks5' or 'http'.
const PROXY_SCHEME = (process.env.GEMINI_PROXY_SCHEME || 'socks5').toLowerCase();

// Local port range used for the throwaway proxies (one per concurrent worker).
const BASE_PORT = Number(process.env.GEMINI_PROXY_BASE_PORT || 21100);

// Egress countries where Gemini is NOT available — a cheap pre-filter so we
// don't even bother spinning up a proxy for an obviously-blocked server. The
// real probe is still the source of truth; this only skips certain losers.
const BLOCKED_CC = new Set(
  (process.env.GEMINI_BLOCKED_CC || 'RU,CN,HK,MO,BY,IR,KP,SY,CU')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cheap pre-filter. Unknown country → false (let the real probe decide).
export function isCountryGeminiBlocked(cc) {
  if (!cc) return false;
  return BLOCKED_CC.has(String(cc).toUpperCase());
}

function buildProxyArgs(uri, port) {
  return PROXY_ARGS_TMPL.trim()
    .split(/\s+/)
    .map((t) => t.replace('{URI}', uri).replace('{PORT}', String(port)));
}

// If the inbound printed random credentials, grab them for SOCKS5 user/pass auth.
function parseCreds(stdout) {
  const u = stdout.match(/Username:\s*(\S+)/);
  const p = stdout.match(/Password:\s*(\S+)/);
  return u && p ? { user: u[1], pass: p[1] } : null;
}

// Wait until 127.0.0.1:port accepts a TCP connection (proxy listener is up).
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

// --- Minimal SOCKS5 CONNECT (no-auth, or user/pass) → connected socket. ------
function socks5Connect(proxyPort, destHost, destPort, timeoutMs, creds) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, '127.0.0.1');
    let stage = 'greet';
    let buf = Buffer.alloc(0);
    const fail = (e) => {
      sock.destroy();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    const sendConnect = () => {
      stage = 'connect';
      buf = Buffer.alloc(0);
      const h = Buffer.from(destHost, 'utf8');
      sock.write(
        Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, h.length]),
          h,
          Buffer.from([(destPort >> 8) & 0xff, destPort & 0xff]),
        ])
      );
    };
    sock.setTimeout(timeoutMs, () => fail(new Error('socks5 timeout')));
    sock.once('error', fail);
    // Offer: no-auth (0x00) and, if we have creds, user/pass (0x02).
    sock.on('connect', () =>
      sock.write(creds ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]))
    );
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 'greet') {
        if (buf.length < 2) return;
        const method = buf[1];
        if (buf[0] !== 0x05) return fail(new Error('bad socks version'));
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

// --- Minimal HTTP-CONNECT tunnel → connected socket. -------------------------
function httpConnect(proxyPort, destHost, destPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, '127.0.0.1');
    let buf = '';
    const fail = (e) => {
      sock.destroy();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    sock.setTimeout(timeoutMs, () => fail(new Error('http-connect timeout')));
    sock.once('error', fail);
    sock.on('connect', () => {
      sock.write(`CONNECT ${destHost}:${destPort} HTTP/1.1\r\nHost: ${destHost}:${destPort}\r\n\r\n`);
    });
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

// GET an HTTPS URL through the local tunnel; return { status, raw }.
async function httpsGetThroughTunnel(proxyPort, urlStr, timeoutMs, creds) {
  const u = new URL(urlStr);
  const destPort = u.port ? Number(u.port) : 443;
  const raw = await tunnelConnect(proxyPort, u.hostname, destPort, timeoutMs, creds);
  return await new Promise((resolve, reject) => {
    const cleanup = () => {
      try { tlsSock.destroy(); } catch {}
      try { raw.destroy(); } catch {}
    };
    const tlsSock = tls.connect(
      { socket: raw, servername: u.hostname, ALPNProtocols: ['http/1.1'], rejectUnauthorized: false },
      () => {
        tlsSock.write(
          `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
            `Host: ${u.hostname}\r\n` +
            `User-Agent: Mozilla/5.0\r\n` +
            `Accept: */*\r\n` +
            `Connection: close\r\n\r\n`
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
    tlsSock.on('data', (d) => {
      buf += d.toString('utf8');
      // The error/JSON bodies we care about are tiny; bail early once we have it.
      if (buf.length > 64 * 1024) finish(null);
    });
    tlsSock.on('end', () => finish(null));
    tlsSock.on('close', () => finish(null));
  });
}

// Decide availability from the raw HTTP response (head + body searched together,
// so we don't have to de-chunk — the literal phrases survive chunk framing).
function classify({ status, raw }) {
  if (/User location is not supported/i.test(raw) || (BLOCK_SIGNAL && raw.includes(BLOCK_SIGNAL))) {
    return 'blocked';
  }
  if (/FAILED_PRECONDITION/.test(raw) && /location/i.test(raw)) return 'blocked';
  // Got past the geo gate: invalid-key 400, or any other non-location answer.
  if (status === 400 && /API[_ ]?key not valid|API_KEY_INVALID/i.test(raw)) return 'available';
  if (status >= 200 && status < 500) return 'available';
  return 'unknown'; // 5xx / garbage / empty — treated as fail by the caller
}

// Probe ONE config: spawn proxy → real Gemini request → read body → classify.
async function probeOne(uri, port, { spawnTimeoutMs, probeTimeoutMs }) {
  const args = buildProxyArgs(uri, port);
  const child = spawn(XK_PATH, args, { windowsHide: true });
  let spawnErr = null;
  let outBuf = '';
  child.on('error', (e) => { spawnErr = e; });
  // Drain stdio so the child never blocks; keep a little for cred-parsing/diag.
  child.stdout?.on('data', (d) => { if (outBuf.length < 8192) outBuf += d.toString(); });
  child.stderr?.on('data', (d) => { if (outBuf.length < 8192) outBuf += d.toString(); });
  const kill = () => { try { child.kill('SIGKILL'); } catch {} };
  try {
    const up = await waitForPort(port, spawnTimeoutMs);
    if (spawnErr) return { ok: false, verdict: 'spawn-error', detail: spawnErr.message };
    if (!up) return { ok: false, verdict: 'proxy-not-up' };
    const res = await httpsGetThroughTunnel(port, GEMINI_PROBE_URL, probeTimeoutMs, parseCreds(outBuf));
    const verdict = classify(res);
    return { ok: verdict === 'available', verdict };
  } catch (e) {
    return { ok: false, verdict: 'probe-error', detail: e.message };
  } finally {
    kill();
  }
}

/**
 * Real Gemini availability check for a batch of configs.
 *
 * @param {string[]} uris
 * @param {object} opts
 * @param {number} [opts.concurrency=8]
 * @param {(uri:string)=>(string|null)} [opts.countryOf]  egress country-code per uri (pre-filter)
 * @param {number} [opts.spawnTimeoutMs=10000]
 * @param {number} [opts.probeTimeoutMs=15000]
 * @returns {Promise<{uri:string, ok:boolean, verdict:string}[]>}
 */
export async function geminiCheckAll(uris, opts = {}) {
  const {
    concurrency = 8,
    countryOf = null,
    spawnTimeoutMs = 10000,
    probeTimeoutMs = 15000,
  } = opts;

  const results = new Array(uris.length);
  let next = 0;

  const workerCount = Math.max(1, Math.min(concurrency, uris.length));
  const workers = Array.from({ length: workerCount }, async (_, w) => {
    const port = BASE_PORT + w;
    while (true) {
      const idx = next++;
      if (idx >= uris.length) break;
      const uri = uris[idx];

      // Cheap country pre-filter.
      if (countryOf) {
        const cc = countryOf(uri);
        if (isCountryGeminiBlocked(cc)) {
          results[idx] = { uri, ok: false, verdict: `prefilter-${cc}` };
          continue;
        }
      }

      // Real probe, with one retry on transient setup failure.
      let r = await probeOne(uri, port, { spawnTimeoutMs, probeTimeoutMs });
      if (!r.ok && (r.verdict === 'proxy-not-up' || r.verdict === 'probe-error' || r.verdict === 'unknown')) {
        await sleep(300);
        r = await probeOne(uri, port, { spawnTimeoutMs, probeTimeoutMs });
      }
      results[idx] = { uri, ok: r.ok, verdict: r.verdict };
    }
  });

  await Promise.all(workers);

  // Verdict histogram — makes silent, systemic failures obvious in the logs.
  const hist = {};
  for (const r of results) {
    if (!r) continue;
    const key = r.verdict.startsWith('prefilter-') ? 'prefilter' : r.verdict;
    hist[key] = (hist[key] || 0) + 1;
  }
  const summary = Object.entries(hist).map(([k, v]) => `${k}=${v}`).join(' ');
  log.info(`Gemini probe verdicts: ${summary}`);

  const setupFails = (hist['proxy-not-up'] || 0) + (hist['spawn-error'] || 0);
  const probed = uris.length - (hist['prefilter'] || 0);
  if (probed > 0 && (hist['available'] || 0) === 0 && setupFails / probed > 0.6) {
    log.err(
      `Gemini probe failed to start/connect the local proxy for most servers via ` +
        `"${XK_PATH} ${PROXY_ARGS_TMPL}". Your xray-knife "proxy" flags likely differ — ` +
        `override XRAY_KNIFE_PROXY_ARGS / GEMINI_PROXY_SCHEME, then verify with ` +
        `scripts/gemini-probe-test.mjs.`
    );
  }

  return results;
}
