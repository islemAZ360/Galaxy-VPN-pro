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
import { log, banner, C } from './log.js';

const POLL_MS   = 15_000; // Poll every 15s for fast UI updates
const STABLE_MS = (Number(process.env.STABILITY_WAIT_MIN) || 5) * 60_000;

// Track what we've already processed so we don't re-trigger
let lastTriggeredAt = null;

// Hide cursor for clean animation, restore on exit
process.stdout.write('\x1b[?25l');
process.on('SIGINT', () => {
  process.stdout.write('\x1b[?25h\n');
  process.exit(0);
});

// Throttling for terminal spam
let lastCountStr = '';
let currentTickerMsg = 'Initializing...';
let tickerColor = C.cyan;

// Start the high-fps UI animation loop (10 fps)
setInterval(() => {
  log.ticker(currentTickerMsg, tickerColor);
}, 100);

async function getWorkerStatus() {
  const { data } = await supa
    .from('worker_status')
    .select('last_result, last_sync_at')
    .eq('id', 'worker')
    .maybeSingle();
  return data;
}

// Read the admin's global limits (Base% & Gemini Scan%) from the DB
// so automatic triggers respect the dashboard slider settings.
async function getGlobalLimits() {
  try {
    const { data } = await supa
      .from('worker_settings')
      .select('base_pct, wifi_deep_pct')
      .eq('id', 'global')
      .maybeSingle();
    return {
      base: data?.base_pct ?? 100,
      geminiScan: data?.wifi_deep_pct ?? 100,
    };
  } catch {
    return { base: 100, geminiScan: 100 };
  }
}

async function getServerCounts() {
  try {
    // Use HEAD count queries — no row limit, instant, accurate.
    const base = supa.from('servers').select('*', { count: 'exact', head: true })
      .eq('is_working', true).eq('is_deleted', false);

    const [totalR, wifiR, lteR] = await Promise.all([
      base,
      supa.from('servers').select('*', { count: 'exact', head: true })
        .eq('is_working', true).eq('is_deleted', false)
        .in('network_type', ['wifi', 'gemini_wifi']),
      supa.from('servers').select('*', { count: 'exact', head: true })
        .eq('is_working', true).eq('is_deleted', false)
        .in('network_type', ['lte', 'gemini_lte']),
    ]);

    return {
      total: totalR.count ?? 0,
      wifi:  wifiR.count ?? 0,
      lte:   lteR.count ?? 0,
    };
  } catch {
    return { total: 0, wifi: 0, lte: 0 };
  }
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

let currentState = 'idle';
let presenceLogged = false;
const presenceChannel = supa.channel('worker_presence', {
  config: { presence: { key: 'phone-worker' } }
});
presenceChannel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    if (!presenceLogged) {
      log.ok('Presence connected — phone worker is online in realtime!');
      presenceLogged = true;
    }
    try {
      await presenceChannel.track({ state: currentState, online_at: new Date().toISOString() });
    } catch { /* best-effort */ }
  }
});

async function trackPresence(state) {
  currentState = state;
  if (presenceChannel?.state === 'joined') {
    try {
      await presenceChannel.track({ state, online_at: new Date().toISOString() });
    } catch { /* best-effort */ }
  }
}

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
          await trackPresence('syncing');
          const result = await runLteCascade({ basePercentage: bp, detailsPercentage: dp });
          await trackPresence('idle');
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
      const countStr = `Wifi:${counts.wifi} LTE:${counts.lte}`;

      // If counts change, print a permanent log line to keep history
      if (countStr !== lastCountStr && lastCountStr !== '') {
        log.info(`Servers updated: ${countStr}`);
      }
      lastCountStr = countStr;
      // Check if WiFi cascade finished recently
      const wifiDone = lr?.finishedAt && lr?.mode === 'wifi';
      const wifiFinishedAt = wifiDone ? lr.finishedAt : null;
      const alreadyTriggered = wifiFinishedAt && lr?.lte_auto_triggered_for === wifiFinishedAt;
      const alreadyProcessed = wifiFinishedAt && lastTriggeredAt === wifiFinishedAt;

      if (wifiDone && !alreadyTriggered && !alreadyProcessed && counts.wifi > 0) {
        // WiFi scan finished and LTE not yet triggered for this run
        const expectedChunks = lr?.chunkTotal || 1;
        let allChunksDone = false;

        if (lr?.isLocal) {
          // It's a direct local PC run. It tests everything synchronously.
          // No need to wait for chunks or stability.
          allChunksDone = true;
        } else if (expectedChunks <= 1) {
          // No chunks (e.g. legacy manual run), just wait a little bit
          const ageMs = now - new Date(wifiFinishedAt);
          if (ageMs >= STABLE_MS) allChunksDone = true;
          else {
            currentTickerMsg = `⏳ Wait ${Math.round((STABLE_MS - ageMs) / 1000)}s...`;
            tickerColor = C.cyan;
          }
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
            currentTickerMsg = `⏳ Waiting CI: ${doneCount}/${expectedChunks} chunks`;
            tickerColor = C.amber;
          }
        }

        if (allChunksDone) {
          log.clearProgress();
          log.step('🚀 All chunks confirmed! Starting LTE cascade...');

          // Read the admin's global limits so auto-triggers respect the sliders
          const limits = await getGlobalLimits();
          log.info(`Using limits: Base=${limits.base}%, Gemini=${limits.geminiScan}%`);

          // Run the LTE cascade
          try {
            await trackPresence('syncing');
            currentTickerMsg = 'Running LTE cascade...';
            tickerColor = C.amber;
            const result = await runLteCascade({ basePercentage: limits.base, detailsPercentage: limits.geminiScan });
            await trackPresence('idle');
            log.clearProgress();
            log.done(`✅ Auto LTE cascade completed! Result: ${JSON.stringify(result)}`);
            
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
            log.clearProgress();
            log.err(`LTE cascade failed: ${e.message}`);
          }
        }
      } else if (alreadyTriggered || alreadyProcessed) {
        currentTickerMsg = `LTE tested | ${countStr}`;
        tickerColor = C.gray;
        firstDetectionAt = null;
      } else {
        currentTickerMsg = `Idle | ${countStr}`;
        tickerColor = C.cyan;
        firstDetectionAt = null;
      }
    } catch (e) {
      log.clearProgress();
      log.err(`Poll error: ${e.message}. Retrying next cycle...`);
    }

    await sleep(POLL_MS);
  }
})();

// Graceful shutdown
async function handleShutdown() {
  log.info('Shutting down watcher...');
  try {
    if (presenceChannel) await presenceChannel.untrack();
    await supa.from('worker_status').upsert({
      id: 'phone-worker',
      state: 'offline',
      last_seen: new Date(Date.now() - 60000).toISOString() // Force DB age > 25s
    }, { onConflict: 'id' });
  } catch { /* best effort */ }
  await closeSupa();
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
