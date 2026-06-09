import net from 'node:net';
import { parseConfig } from './uri.js';

// TCP-reachability test: connect to host:port, measure latency.
// This is the baseline filter that works everywhere with no external binary.
// TODO (enhancement): swap/augment with a real protocol test via xray-knife
//   or sing-box `check` for full VLESS/VMess/Trojan validation. The Dockerfile
//   installs xray-knife so this can be upgraded without infra changes.
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

// Concurrency-limited batch tester.
export async function testAll(uris, { concurrency = 50, timeoutMs = 4000 } = {}) {
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
