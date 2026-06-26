import cron from 'node-cron';
import { supa } from './supa.js';
import {
  runWifiCascade,
  runLteCascade,
  runWhitelistCascade,
  runLatencyCheck,
  isRunning
} from './sync.js';
import { banner, log } from './log.js';

const CRON = process.env.SYNC_CRON || '*/30 * * * *'; // every 30 min
const POLL_MS = Number(process.env.REQUEST_POLL_MS || 15_000);
const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS || 15_000);
// Realtime websocket: on a flaky Russian LTE+VPN link the websocket gets killed
// every ~20s by DPI/proxy (long-lived connections are targeted even when short
// HTTP/REST works perfectly through the VPN). The websocket only provides two
// niceties — instant sync triggers and a presence channel — both of which have
// reliable REST-based replacements: the POLL_MS poll catches sync_requests, and
// the DB heartbeat (last_seen) drives the dashboard online badge. So we default
// the websocket OFF. Set WORKER_REALTIME=1 to re-enable it on a stable link.
const USE_REALTIME = process.env.WORKER_REALTIME === '1';

banner();
log.ok(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
log.info(`Scheduled cron: ${CRON}  ·  request poll: ${POLL_MS / 1000}s  ·  realtime: ${USE_REALTIME ? 'on' : 'off (REST poll + DB heartbeat)'}`);

// --- Heartbeat + status (so the admin dashboard sees us live) ----------------
let presenceChannel = null;
let currentState = 'idle';

async function trackPresence(state) {
  currentState = state;
  if (presenceChannel?.state === 'joined') {
    try {
      await presenceChannel.track({ state, online_at: new Date().toISOString() });
    } catch { /* best-effort */ }
  }
  // DB heartbeat: write last_seen + state so the dashboard can show "Online"
  // via REST polling even when the realtime websocket is off/flaky. This is a
  // tiny single-row upsert through the resilient customFetch (buffered +
  // retried), so it survives transient network blips. Best-effort.
  heartbeat().catch(() => {});
}

// Single-row DB heartbeat. Called from trackPresence() and on a 15s interval.
// The dashboard treats last_seen < 40s as "online", decoupling online-detection
// from the (optional, flaky) websocket.
async function heartbeat() {
  try {
    await supa.from('worker_status').upsert({
      id: 'worker',
      state: currentState,
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch { /* best-effort — retried on the next tick */ }
}

if (USE_REALTIME) {
  presenceChannel = supa.channel('worker_presence', {
    config: { presence: { key: 'worker' } }
  });
  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      log.ok('Presence connected — worker is online');
      trackPresence(currentState);
    }
  });
} else {
  // No presence channel — the DB heartbeat is the sole online signal. Mark
  // ourselves online immediately so the dashboard flips green right after boot.
  heartbeat().catch(() => {});
}

async function runWithStatus(reason, fn) {
  await trackPresence('syncing');
  const result = await fn();
  await trackPresence('idle');
  
  // Persist the result to the DB so the dashboard can display it
  try {
    await supa.from('worker_status').upsert({
      id: 'worker',
      state: 'idle',
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      last_result: { reason, isLocal: true, ...result },
    }, { onConflict: 'id' });
  } catch { /* best-effort */ }
  
  return result;
}

const wifiWithStatus = (reason, percentages) => runWithStatus(reason, () => runWifiCascade(percentages));
const lteWithStatus = (reason, percentages) => runWithStatus(reason, () => runLteCascade(percentages));
const whitelistWithStatus = (reason, percentages) => runWithStatus(reason, () => runWhitelistCascade(percentages));
const latencyWithStatus = (reason, percentages) => runWithStatus(reason, () => runLatencyCheck(percentages));

// --- Process admin sync requests --------------------------------------------
// The POLL_MS poll loop is the primary, reliable trigger: it reads pending
// sync_requests rows over REST (resilient — buffered + retried) and runs them.
// drainPending() claims all currently pending rows with a single sync, so
// duplicate triggers can't double-run.
let draining = false;
async function drainPending(source) {
  if (draining || isRunning()) return;
  draining = true;
  try {
    const { data: pending, error } = await supa
      .from('sync_requests').select('id, kind, percentage, details_percentage').is('processed_at', null);
    if (error || !pending?.length) return;

    // Two cascades now. Map any legacy kinds onto them:
    //   wifi  (+ legacy full / gemini_wifi) → Wi-Fi cascade (Wi-Fi DPI → Gemini)
    //   lte   (+ legacy gemini_lte)         → LTE cascade   (LTE DPI → Gemini)
    const latencyReqs = pending.filter((p) => p.kind === 'latency');
    const whitelistReqs = pending.filter((p) => p.kind === 'whitelist');
    const lteReqs = pending.filter((p) => p.kind === 'lte' || p.kind === 'gemini_lte');
    const wifiReqs = pending.filter((p) => !latencyReqs.includes(p) && !lteReqs.includes(p) && !whitelistReqs.includes(p));
    log.bell(`${pending.length} request(s) pending (${source}) — wifi:${wifiReqs.length} lte:${lteReqs.length} whitelist:${whitelistReqs.length} latency:${latencyReqs.length}`);

    const markDone = (ids, result) =>
      supa.from('sync_requests').update({ processed_at: new Date().toISOString(), result }).in('id', ids);

    const getPercentages = (reqs) => ({
      basePercentage: reqs[0]?.percentage ?? 100,
      detailsPercentage: reqs[0]?.details_percentage ?? 100,
    });

    // Order: Wi-Fi (rebuilds the base pool) → LTE (refines) → White-list → latency
    if (wifiReqs.length) await markDone(wifiReqs.map((p) => p.id), await wifiWithStatus('admin-wifi', getPercentages(wifiReqs)));
    if (lteReqs.length) await markDone(lteReqs.map((p) => p.id), await lteWithStatus('admin-lte', getPercentages(lteReqs)));
    if (whitelistReqs.length) await markDone(whitelistReqs.map((p) => p.id), await whitelistWithStatus('admin-whitelist', getPercentages(whitelistReqs)));
    if (latencyReqs.length) await markDone(latencyReqs.map((p) => p.id), await latencyWithStatus('admin-latency', getPercentages(latencyReqs)));
  } catch (e) {
    log.err(`drain failed: ${e.message}`);
  } finally {
    draining = false;
  }
}

// Realtime (instant) — OPTIONAL. Only enabled when WORKER_REALTIME=1. On a
// flaky link the websocket reconnects every ~20s, which is pure noise; the poll
// loop is the reliability guarantee either way.
if (USE_REALTIME) {
  let warnedRealtime = false;
  supa
    .channel('worker-sync-requests')
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sync_requests' },
        () => drainPending('realtime'))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log.ok('Realtime connected — instant admin triggers enabled');
        warnedRealtime = false;
      } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !warnedRealtime) {
        log.warn('Realtime reconnecting… (polling still active, nothing is missed)');
        warnedRealtime = true; // don't spam on every reconnect
      }
    });
}

// Poll — the primary, reliable trigger. Runs whether or not realtime is on.
setInterval(() => drainPending('poll'), POLL_MS);

// DB heartbeat every 15s — keeps worker_status.last_seen fresh so the admin
// dashboard shows "Online" via REST polling. Best-effort; a missed tick just
// retries next. This is the online signal when realtime is off.
setInterval(() => { heartbeat().catch(() => {}); }, HEARTBEAT_MS);

// --- Scheduled background sync ----------------------------------------------
// Disabled per user request - scans only run manually now.
// cron.schedule(CRON, () => {
//   if (isRunning()) return;
//   log.info('Cron tick — running scheduled sync');
//   syncWithStatus('cron');
// });

// --- Initial sync on boot ----------------------------------------------------
// On boot, we clear any pending/stale requests left over from a previous crash 
// so they don't unexpectedly run on the wrong network (e.g. LTE vs WIFI).
(async () => {
  log.step('Clearing stale requests on startup…');
  try {
    await trackPresence('idle');
    await supa
      .from('sync_requests')
      .update({ processed_at: new Date().toISOString(), result: { aborted: 'startup-cleared' } })
      .is('processed_at', null);
  } catch (e) {
    log.err('Failed to clear stale requests on startup');
  }
  log.ok('Ready! Waiting for manual trigger from admin dashboard...');
})();

async function handleShutdown() {
  log.info('Shutting down worker...');
  try {
    if (presenceChannel) await presenceChannel.untrack();
    await supa.from('worker_status').upsert({
      id: 'worker',
      state: 'offline',
      last_seen: new Date(Date.now() - 60000).toISOString()
    }, { onConflict: 'id' });
  } catch { /* best effort */ }
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
