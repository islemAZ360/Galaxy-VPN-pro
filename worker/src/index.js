import cron from 'node-cron';
import { supa } from './supa.js';
import { runSync, runLteRecheck, isRunning } from './sync.js';
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

    const lteReqs = pending.filter((p) => p.kind === 'lte');
    const fullReqs = pending.filter((p) => p.kind !== 'lte');
    log.bell(`${pending.length} request(s) pending (${source}) — full:${fullReqs.length} lte:${lteReqs.length}`);

    // Run a full sync if any full request is queued, then an LTE re-check if any.
    if (fullReqs.length) {
      const result = await syncWithStatus('admin');
      await supa.from('sync_requests')
        .update({ processed_at: new Date().toISOString(), result })
        .in('id', fullReqs.map((p) => p.id));
    }
    if (lteReqs.length) {
      const result = await lteWithStatus('admin-lte');
      await supa.from('sync_requests')
        .update({ processed_at: new Date().toISOString(), result })
        .in('id', lteReqs.map((p) => p.id));
    }
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
cron.schedule(CRON, () => {
  if (isRunning()) return;
  log.info('Cron tick — running scheduled sync');
  syncWithStatus('cron');
});

// --- Initial sync on boot ----------------------------------------------------
log.step('Running initial sync on startup…');
syncWithStatus('startup').then(() => drainPending('startup'));

process.on('SIGINT', () => {
  log.warn('Shutting down…');
  setStatus({ state: 'offline', last_seen: new Date().toISOString() }).finally(() => process.exit(0));
});
