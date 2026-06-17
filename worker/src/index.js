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

banner();
log.ok(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
log.info(`Scheduled cron: ${CRON}  ·  request poll: ${POLL_MS / 1000}s`);

// --- Heartbeat + status (so the admin dashboard sees us live) ----------------
const presenceChannel = supa.channel('worker_presence', {
  config: { presence: { key: 'worker' } }
});

let currentState = 'idle';

async function trackPresence(state) {
  currentState = state;
  if (presenceChannel.state === 'joined') {
    try {
      await presenceChannel.track({ state, online_at: new Date().toISOString() });
    } catch { /* best-effort */ }
  }
}

presenceChannel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    log.ok('Presence connected — worker is online');
    trackPresence(currentState);
  }
});

async function runWithStatus(reason, fn) {
  await trackPresence('syncing');
  const result = await fn();
  await trackPresence('idle');
  
  // Persist the result to the DB so the dashboard can display it
  try {
    await supa.from('worker_status').upsert({
      id: 'worker',
      updated_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      last_result: { reason, ...result },
    }, { onConflict: 'id' });
  } catch { /* best-effort */ }
  
  return result;
}

const wifiWithStatus = (reason) => runWithStatus(reason, runWifiCascade);
const lteWithStatus = (reason) => runWithStatus(reason, runLteCascade);
const whitelistWithStatus = (reason) => runWithStatus(reason, runWhitelistCascade);
const latencyWithStatus = (reason) => runWithStatus(reason, runLatencyCheck);

// --- Process admin sync requests --------------------------------------------
// Realtime gives an instant trigger; a poll loop guarantees nothing is missed
// if the (sometimes flaky) websocket drops. drainPending() claims all currently
// pending rows with a single sync, so duplicate triggers can't double-run.
let draining = false;
async function drainPending(source) {
  if (draining || isRunning()) return;
  draining = true;
  try {
    const { data: pending, error } = await supa
      .from('sync_requests').select('id, kind').is('processed_at', null);
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

    // Order: Wi-Fi (rebuilds the base pool) → LTE (refines) → White-list → latency
    if (wifiReqs.length) await markDone(wifiReqs.map((p) => p.id), await wifiWithStatus('admin-wifi'));
    if (lteReqs.length) await markDone(lteReqs.map((p) => p.id), await lteWithStatus('admin-lte'));
    if (whitelistReqs.length) await markDone(whitelistReqs.map((p) => p.id), await whitelistWithStatus('admin-whitelist'));
    if (latencyReqs.length) await markDone(latencyReqs.map((p) => p.id), await latencyWithStatus('admin-latency'));
  } catch (e) {
    log.err(`drain failed: ${e.message}`);
  } finally {
    draining = false;
  }
}

// Realtime (instant) — best-effort; the poll loop is the reliability guarantee.
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

// Poll fallback
setInterval(() => drainPending('poll'), POLL_MS);

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

process.on('SIGINT', () => {
  log.warn('Shutting down…');
  presenceChannel.untrack().finally(() => process.exit(0));
});
