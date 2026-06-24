// Termux Auto-LTE Watcher
// ========================
// Runs on your Samsung phone in Termux. Polls Supabase every few minutes and
// automatically triggers the LTE cascade when SourceCraft finishes WiFi scanning.
//
// Usage:
//   AUTO_MODE=1 npm run termux:watch
//
// Environment variables:
//   SUPABASE_URL              - Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
//   POLL_INTERVAL_MIN         - Poll interval in minutes (default: 3)
//   STABILITY_WAIT_MIN        - Minutes to wait after detection to confirm all
//                               SourceCraft chunks finished (default: 5)
//   AUTO_MODE                 - Must be '1' or 'true' to skip VPN prompts

import { runLteCascade } from './sync.js';
import { supa, closeSupa } from './supa.js';
import { log, banner } from './log.js';

const POLL_MS   = 15_000; // Poll every 15s for fast UI updates
const STABLE_MS = (Number(process.env.STABILITY_WAIT_MIN) || 5) * 60_000;

// Track what we've already processed so we don't re-trigger
let lastTriggeredAt = null;

async function getWorkerStatus() {
  const { data } = await supa
    .from('worker_status')
    .select('last_result, last_sync_at')
    .eq('id', 'worker')
    .maybeSingle();
  return data;
}

async function getServerCounts() {
  const { data } = await supa
    .from('servers')
    .select('network_type')
    .eq('is_working', true)
    .eq('is_deleted', false);
  
  if (!data) return { total: 0, wifi: 0, lte: 0 };
  
  const counts = { total: data.length, wifi: 0, lte: 0 };
  for (const s of data) {
    if (s.network_type === 'wifi' || s.network_type === 'gemini_wifi') counts.wifi++;
    if (s.network_type === 'lte' || s.network_type === 'gemini_lte') counts.lte++;
  }
  return counts;
}

async function recordLteTrigger(wifiFinishedAt) {
  try {
    const { data } = await supa
      .from('worker_status')
      .select('last_result')
      .eq('id', 'worker')
      .maybeSingle();
    const prev = data?.last_result || {};
    await supa.from('worker_status').upsert({
      id: 'worker',
      last_result: { ...prev, lte_auto_triggered_for: wifiFinishedAt },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch { /* best effort */ }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

banner();
log.ok('📱 Termux Auto-LTE Watcher started');
log.info(`Poll interval: ${POLL_MS / 60_000} min | Stability wait: ${STABLE_MS / 60_000} min`);

if (process.env.AUTO_MODE !== 'true' && process.env.AUTO_MODE !== '1') {
  log.warn('⚠️  AUTO_MODE is not set! VPN prompts will block the test.');
  log.warn('   Set AUTO_MODE=1 in your .env file.');
}

let firstDetectionAt = null;
let firstDetectionFinishedAt = null;

(async () => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Send heartbeat so the dashboard knows the phone is online (separated from PC worker)
      try {
        await supa.from('worker_status').upsert({
          id: 'phone-worker',
          last_seen: new Date().toISOString(),
          state: 'idle'
        }, { onConflict: 'id' });
      } catch (e) {
        log.err(`Heartbeat failed: ${e.message}`);
      }

      // Check for manual UI triggers
      const { data: manualReqs } = await supa
        .from('sync_requests')
        .select('id, kind, percentage, details_percentage')
        .is('processed_at', null)
        .eq('kind', 'lte');
      
      if (manualReqs && manualReqs.length > 0) {
        log.step(`🔔 Manual LTE trigger detected from dashboard!`);
        
        // Mark it as processed immediately so others don't pick it up
        const reqIds = manualReqs.map(r => r.id);
        await supa.from('sync_requests').update({ processed_at: new Date().toISOString(), result: { status: 'running on phone' } }).in('id', reqIds);
        
        try {
          const bp = manualReqs[0]?.percentage ?? 100;
          const dp = manualReqs[0]?.details_percentage ?? 100;
          const result = await runLteCascade({ basePercentage: bp, detailsPercentage: dp });
          log.done(`✅ Manual LTE cascade completed! Result: ${JSON.stringify(result)}`);
          
          await supa.from('sync_requests').update({ result }).in('id', reqIds);
          
          const { data } = await supa.from('worker_status').select('last_result').eq('id', 'worker').maybeSingle();
          const prev = data?.last_result || {};
          await supa.from('worker_status').upsert({
            id: 'worker',
            state: 'idle',
            updated_at: new Date().toISOString(),
            last_sync_at: new Date().toISOString(),
            last_result: { ...prev, reason: 'manual-ui-lte', ...result },
          }, { onConflict: 'id' });
        } catch (e) {
          log.err(`Manual LTE cascade failed: ${e.message}`);
        }
        
        continue; // skip the rest of the loop for this tick
      }

      const status = await getWorkerStatus();
      const counts = await getServerCounts();
      const lr = status?.last_result;

      const now = new Date();
      log.info(`[${now.toLocaleTimeString()}] Servers: ${counts.total} total (${counts.wifi} wifi, ${counts.lte} lte)`);

      // Check if WiFi cascade finished recently
      const wifiDone = lr?.finishedAt && lr?.mode === 'wifi';
      const wifiFinishedAt = wifiDone ? lr.finishedAt : null;
      const alreadyTriggered = wifiFinishedAt && lr?.lte_auto_triggered_for === wifiFinishedAt;
      const alreadyProcessed = wifiFinishedAt && lastTriggeredAt === wifiFinishedAt;

      if (wifiDone && !alreadyTriggered && !alreadyProcessed && counts.wifi > 0) {
        // WiFi scan finished and LTE not yet triggered for this run
        const expectedChunks = lr?.chunkTotal || 1;
        let allChunksDone = false;

        if (expectedChunks <= 1) {
          // No chunks (e.g. manual run), just wait a little bit
          const ageMs = now - new Date(wifiFinishedAt);
          if (ageMs >= STABLE_MS) allChunksDone = true;
          else log.info(`⏳ Single chunk: Waiting ${Math.round((STABLE_MS - ageMs) / 1000)}s more...`);
        } else {
          // CI chunks: Check if we have expected number of recent chunk completions
          const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
          const { data: chunkRows } = await supa
            .from('worker_status')
            .select('id, updated_at, last_result')
            .like('id', 'worker-chunk-%')
            .gte('updated_at', twoHoursAgo);
          
          if (chunkRows && chunkRows.length >= expectedChunks) {
            allChunksDone = true;
          } else {
            const doneCount = chunkRows ? chunkRows.length : 0;
            log.info(`⏳ Waiting for all SourceCraft tasks... (${doneCount}/${expectedChunks} chunks finished)`);
          }
        }

        if (allChunksDone) {
          log.step('🚀 All chunks confirmed! Starting LTE cascade...');

          // Run the LTE cascade
          try {
            const result = await runLteCascade({ basePercentage: 100, detailsPercentage: 100 });
            log.done(`✅ LTE cascade completed! Result: ${JSON.stringify(result)}`);
            
            // Mark as triggered AFTER running successfully so if it crashes or is killed, it will retry
            lastTriggeredAt = wifiFinishedAt;
            await recordLteTrigger(wifiFinishedAt);

            // Record final status
            try {
              const { data } = await supa
                .from('worker_status')
                .select('last_result')
                .eq('id', 'worker')
                .maybeSingle();
              const prev = data?.last_result || {};
              await supa.from('worker_status').upsert({
                id: 'worker',
                state: 'idle',
                updated_at: new Date().toISOString(),
                last_sync_at: new Date().toISOString(),
                last_result: { ...prev, reason: 'termux-auto-lte', ...result },
              }, { onConflict: 'id' });
            } catch { /* best effort */ }
          } catch (e) {
            log.err(`LTE cascade failed: ${e.message}`);
          }
        }
      } else if (alreadyTriggered || alreadyProcessed) {
        log.info('💤 LTE already triggered for this WiFi run. Sleeping...');
        firstDetectionAt = null;
      } else {
        log.info('💤 No new WiFi scan to process. Sleeping...');
        firstDetectionAt = null;
      }
    } catch (e) {
      log.warn(`Poll error: ${e.message}. Retrying next cycle...`);
    }

    await sleep(POLL_MS);
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  log.info('Shutting down watcher...');
  await closeSupa();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  log.info('Shutting down watcher...');
  await closeSupa();
  process.exit(0);
});
