import { createClient } from '@supabase/supabase-js';
import { Agent } from 'undici';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[supa] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
}

// ---------------------------------------------------------------------------
// Why this isn't a plain createClient(url, key):
//
// On a phone LTE hotspot (carrier NAT, lower MTU, mobile DPI) a Supabase REST
// connection can stall while establishing — yet Node's default fetch waits on
// undici's 300s headers/body timeouts and finally throws a bare, useless
// "TypeError: terminated" with the real reason buried in err.cause. The worker
// then looks like it "hangs ~1 min then dies", and sync.js's withRetry() can't
// retry because nothing failed fast.
//
// This dispatcher + wrapper does three things, and NOTHING ELSE:
//   1. FAIL FAST on a stalled *connect* (8s) so withRetry() can open a fresh
//      connection instead of the run hanging. Connect on a healthy link is sub-
//      second, so 8s never trips a working request — but headers/body timeouts
//      are kept GENEROUS so a slow-but-working large upsert is never aborted.
//   2. Surface err.cause in the message — the terminal shows the REAL reason
//      (e.g. "(cause: UND_ERR_SOCKET)" / "ECONNRESET" / "UND_ERR_CONNECT_TIMEOUT")
//      instead of just "terminated". This is the whole point: it makes the
//      failure diagnosable instead of a guessing game.
//   3. Drop idle sockets quickly (short keep-alive) so a socket that went stale
//      between calls is never reused — without forcing Connection: close, which
//      on Windows parks every socket in TIME_WAIT and *adds* socket churn.
//
// It deliberately does NOT touch the request headers: supabase-js passes a
// Headers instance, and the previous `{...headers}` spread silently produced {}
// and DROPPED apikey/Authorization — i.e. every call went out unauthenticated.
// Leaving init untouched keeps the service-role key intact.
//
// All timeouts are env-tunable so a genuinely weak link can be accommodated
// without editing code.
// ---------------------------------------------------------------------------
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const dispatcher = new Agent({
  connect: {
    timeout: num(process.env.SUPA_CONNECT_TIMEOUT_MS, 8000), // fail fast on a stalled connect/TLS
    // Some phone hotspots advertise broken/blocked IPv6. Set SUPA_FORCE_IPV4=1
    // to skip it and go straight to IPv4.
    ...(process.env.SUPA_FORCE_IPV4 === '1' ? { family: 4 } : {}),
  },
  headersTimeout: num(process.env.SUPA_HEADERS_TIMEOUT_MS, 30000), // generous: don't abort slow-but-working calls
  bodyTimeout: num(process.env.SUPA_BODY_TIMEOUT_MS, 45000),
  keepAliveTimeout: 2000, // release idle sockets fast; never reuse a stale one
  pipelining: 0,
});

// Short: on a flaky Russian LTE+VPN link the DPI stalls requests inconsistently
// (even small ones), so we want a hung request detected FAST and retried rather
// than waiting 30s per hang. A healthy request is <1s, so 12s never trips a
// working call — but a stalled one is caught at 12s instead of 30s, letting
// withRetry absorb transient DPI stalls silently (4 attempts × 12s = 48s budget
// before the outer withVpnRetry shows its "VPN down" panel). Body is buffered
// (no streaming), so body transfer is near-instant once headers arrive.
const CALL_TIMEOUT = num(process.env.SUPA_CALL_TIMEOUT_MS, 12000); // last-resort per-call ceiling

const customFetch = async (input, init = {}) => {
  const ctrl = new AbortController();
  const caller = init.signal;
  const relay = () => ctrl.abort(caller?.reason);
  if (caller) {
    if (caller.aborted) ctrl.abort(caller.reason);
    else caller.addEventListener('abort', relay, { once: true });
  }
  // Race the whole operation (fetch + body buffer) against a HARD timeout that
  // rejects explicitly. We do NOT rely on ctrl.abort() alone to end the call:
  // on a DPI-stalled link the fetch/arrayBuffer can hang forever without undici's
  // headersTimeout/bodyTimeout ever firing, and ctrl.abort() does not abort an
  // already-pending body read in all undici versions. Without this race the
  // caller (postgrest-js → withRetry → withVpnRetry) never sees an error and the
  // worker freezes at "Fetching servers…". The race guarantees an error within
  // CALL_TIMEOUT so withVpnRetry can surface its "VPN down" panel and retry.
  // The timeout error is tagged AbortError so postgrest-js skips its own 3×
  // retry (which would otherwise burn 3×CALL_TIMEOUT before giving up).
  let timer;
  const timeoutErr = new Error(`Supabase call exceeded ${CALL_TIMEOUT}ms hard timeout`);
  timeoutErr.name = 'AbortError';
  timeoutErr.code = 'ABORT_ERR';
  const timeoutP = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort(timeoutErr); // best-effort cleanup of the underlying socket
      reject(timeoutErr);     // but the race rejects here regardless
    }, CALL_TIMEOUT);
  });
  const op = (async () => {
    try {
      // NOTE: headers are passed through untouched so apikey/Authorization survive.
      const res = await fetch(input, { ...init, dispatcher, signal: ctrl.signal });
      // Buffer the response body HERE, inside the try/catch. Without this, a socket
      // terminated mid-body surfaces as a bare "TypeError: terminated" thrown from
      // postgrest-js's own res.text() — OUTSIDE this wrapper — so the cause-surfacing
      // below never runs. By reading the body now and rebuilding the Response, a
      // body-stream termination is caught and wrapped with its cause just like a
      // connect/headers failure. Supabase REST responses are small JSON, so
      // buffering is cheap and never blocks streaming.
      const buf = new Uint8Array(await res.arrayBuffer());
      return new Response(buf.length ? buf : null, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (err) {
      // undici hides the real reason in err.cause — surface it so logs are useful.
      const c = err?.cause;
      const detail = c ? ` (cause: ${c.code || c.name || c.message})` : '';
      const wrapped = new Error(`${err.message}${detail}`);
      wrapped.cause = err;
      throw wrapped;
    }
  })();
  try {
    return await Promise.race([op, timeoutP]);
  } finally {
    clearTimeout(timer);
    if (caller) caller.removeEventListener?.('abort', relay);
  }
};

// Service-role client: bypasses RLS. NEVER expose this key to the browser.
//
// Realtime heartbeat: supabase-js defaults to 25s. On a flaky Russian VPN the
// heartbeat reply frequently gets lost, forcing a websocket reconnect every
// ~20-45s (visible in the worker log as "Realtime reconnecting…"). A longer
// interval tolerates delayed replies and drastically cuts reconnect churn.
// Tunable via SUPA_REALTIME_HEARTBEAT_MS; set to 25000 to restore the default.
export const supa = createClient(url ?? '', serviceKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { heartbeatIntervalMs: num(process.env.SUPA_REALTIME_HEARTBEAT_MS, 60000) },
  global: { fetch: customFetch },
});

// Close the custom dispatcher before a hard process.exit(). Without this, exiting
// while the Agent still has live sockets/timers trips a libuv assertion on Windows
// (UV_HANDLE_CLOSING). The long-running worker never exits mid-run, but the
// one-shot `npm run sync` and the Ctrl+C path do — call this first there.
export async function closeSupa() {
  try {
    await dispatcher.close();
  } catch {
    /* best-effort */
  }
}
