import cron from 'node-cron';
import { supa } from './supa.js';
import { runSync, runLteRecheck, runGeminiRecheck, runLatencyCheck, isRunning } from './sync.js';
import { banner, log } from './log.js';

const CRON = process.env.SYNC_CRON || '*/30 * * * *'; // every 30 min
const POLL_MS = Number(process.env.REQUEST_POLL_MS || 15_000);

banner();
log.ok(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
log.info(`Scheduled cron: ${CRON}  ·  request poll: ${POLL_MS / 1000}s`);

// --- Heartbeat + status (so the admin dashboard sees us live) ----------------
async function setStatus(fields) {
  try {
    await supa
      .from('worker_status')
      .upsert({ id: 'worker', updated_at: new Date().toISOString(), ...fields }, { onConflict: 'id' });
  } catch { /* best-effort */ }
}
const heartbeat = () => setStatus({ last_seen: new Date().toISOString() });
heartbeat();
setInterval(heartbeat, 10_000);

async function runWithStatus(reason, fn) {
  await setStatus({ state: 'syncing', last_seen: new Date().toISOString() });
  const result = await fn();
  await setStatus({
    state: 'idle',
    last_seen: new Date().toISOString(),
    last_sync_at: new Date().toISOString(),
    last_result: { reason, ...result },
  });
  return result;
}
const syncWithStatus = (reason) => runWithStatus(reason, runSync);
const lteWithStatus = (reason) => runWithStatus(reason, runLteRecheck);
const geminiWithStatus = (reason) => runWithStatus(reason, runGeminiRecheck);
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

    const geminiReqs = pending.filter((p) => p.kind === 'gemini');
    const lteReqs = pending.filter((p) => p.kind === 'lte');
    const latencyReqs = pending.filter((p) => p.kind === 'latency');
    const fullReqs = pending.filter((p) => p.kind !== 'lte' && p.kind !== 'gemini' && p.kind !== 'latency');
    log.bell(`${pending.length} request(s) pending (${source}) — full:${fullReqs.length} lte:${lteReqs.length} gemini:${geminiReqs.length} latency:${latencyReqs.length}`);

    const markDone = (ids, result) =>
      supa.from('sync_requests').update({ processed_at: new Date().toISOString(), result }).in('id', ids);

    // Order: full → lte → gemini → latency
    if (fullReqs.length) await markDone(fullReqs.map((p) => p.id), await syncWithStatus('admin'));
    if (lteReqs.length) await markDone(lteReqs.map((p) => p.id), await lteWithStatus('admin-lte'));
    if (geminiReqs.length) await markDone(geminiReqs.map((p) => p.id), await geminiWithStatus('admin-gemini'));
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
    await setStatus({ state: 'idle', last_seen: new Date().toISOString() });
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
  setStatus({ state: 'offline', last_seen: new Date().toISOString() }).finally(() => process.exit(0));
});
