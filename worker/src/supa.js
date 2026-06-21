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

const CALL_TIMEOUT = num(process.env.SUPA_CALL_TIMEOUT_MS, 60000); // last-resort per-call ceiling

const customFetch = async (input, init = {}) => {
  const ctrl = new AbortController();
  const caller = init.signal;
  const relay = () => ctrl.abort(caller?.reason);
  if (caller) {
    if (caller.aborted) ctrl.abort(caller.reason);
    else caller.addEventListener('abort', relay, { once: true });
  }
  const timer = setTimeout(
    () => ctrl.abort(new Error(`Supabase call exceeded ${CALL_TIMEOUT}ms hard timeout`)),
    CALL_TIMEOUT,
  );
  try {
    // NOTE: headers are passed through untouched so apikey/Authorization survive.
    const res = await fetch(input, { ...init, dispatcher, signal: ctrl.signal });
    // Buffer the response body HERE, inside the try/catch. Without this, a socket
    // terminated mid-body surfaces as a bare "TypeError: terminated" thrown from
    // postgrest-js's own res.text() — OUTSIDE this wrapper — so the cause-surfacing
    // below never runs and the §4.3 diagnosability goal is defeated. By reading the
    // body now and rebuilding the Response, a body-stream termination is caught and
    // wrapped with its cause just like a connect/headers failure. Supabase REST
    // responses are small JSON, so buffering is cheap and never blocks streaming.
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
  } finally {
    clearTimeout(timer);
    if (caller) caller.removeEventListener?.('abort', relay);
  }
};

// Service-role client: bypasses RLS. NEVER expose this key to the browser.
export const supa = createClient(url ?? '', serviceKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
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
