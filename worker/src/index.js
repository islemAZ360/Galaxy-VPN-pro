import cron from 'node-cron';
import { supa } from './supa.js';
import { runSync, isRunning } from './sync.js';
import { banner, log } from './log.js';

const CRON = process.env.SYNC_CRON || '*/30 * * * *'; // every 30 min

banner();
log.ok(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
log.info(`Scheduled cron: ${CRON}`);

// --- Live admin trigger (Supabase Realtime on sync_requests) -----------------
// Admin presses "Re-check all repos" in the dashboard → row inserted here →
// we run runSync() and mark the row processed.
async function handleRequest(row) {
  log.bell(`Sync requested by admin (request id ${row.id.slice(0, 8)}…)`);
  const result = await runSync();
  await supa
    .from('sync_requests')
    .update({ processed_at: new Date().toISOString(), result })
    .eq('id', row.id);
}

const channel = supa
  .channel('worker-sync-requests')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sync_requests' },
      (payload) => handleRequest(payload.new))
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') log.ok('Listening for admin sync requests (Realtime)');
    else if (status === 'CHANNEL_ERROR') log.err('Realtime channel error');
  });

// Drain any pending requests that arrived while the worker was offline.
(async () => {
  const { data: pending } = await supa
    .from('sync_requests').select('id').is('processed_at', null).order('requested_at');
  if (pending?.length) {
    log.bell(`${pending.length} pending request(s) queued while offline — running now`);
    for (const r of pending) await handleRequest(r);
  }
})();

// --- Scheduled background sync ----------------------------------------------
cron.schedule(CRON, () => {
  if (isRunning()) return;
  log.info('Cron tick — running scheduled sync');
  runSync();
});

// --- Initial sync on boot ----------------------------------------------------
log.step('Running initial sync on startup…');
runSync();

// Keep the process alive
process.on('SIGINT', () => {
  log.warn('Shutting down…');
  channel.unsubscribe();
  process.exit(0);
});
