// One-shot cascade runner — the engine behind the phone home-screen shortcuts.
//
//   node --env-file-if-exists=.env src/run-cascade.js wifi
//   node --env-file-if-exists=.env src/run-cascade.js lte
//   node --env-file-if-exists=.env src/run-cascade.js latency
//
// This runs the SAME work the admin "Wi-Fi" / "LTE" buttons trigger on the
// desktop worker — but directly, once, then exits. That makes it perfect for a
// phone (Termux:Widget) shortcut: tap → scan runs on THIS phone's real Wi-Fi /
// LTE connection → process exits. No always-on background process to keep alive
// (which Android would kill anyway).
//
// The outcome is written back to `worker_status` (read-merge-write, so we never
// clobber other keys like balance_mode) so the admin dashboard's "last sync"
// still updates when you trigger a scan from your phone.

import { runWifiCascade, runLteCascade, runWhitelistCascade, runLatencyCheck } from './sync.js';
import { supa, closeSupa } from './supa.js';
import { banner, log } from './log.js';

const CASCADES = {
  wifi: { fn: runWifiCascade, reason: 'phone-wifi' },
  lte: { fn: runLteCascade, reason: 'phone-lte' },
  whitelist: { fn: runWhitelistCascade, reason: 'phone-whitelist' },
  latency: { fn: runLatencyCheck, reason: 'phone-latency' },
};

const mode = (process.argv[2] || 'wifi').toLowerCase();
const chosen = CASCADES[mode];

banner();

if (!chosen) {
  log.err(`Unknown mode "${mode}". Use one of: ${Object.keys(CASCADES).join(' | ')}`);
  process.exit(1);
}

log.ok(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
log.step(`One-shot ${mode.toUpperCase()} re-check (phone mode)`);

// Persist the result so the admin dashboard reflects phone-triggered scans.
async function recordStatus(result) {
  try {
    const now = new Date().toISOString();
    const chunkIndex = Number(process.env.TEST_CHUNK_INDEX) || 0;
    const chunkTotal = Number(process.env.TEST_CHUNKS_TOTAL) || 1;

    // Update main worker row (dashboard uses this)
    const { data } = await supa
      .from('worker_status').select('last_result').eq('id', 'worker').maybeSingle();
    const prev = data?.last_result || {};
    await supa.from('worker_status').upsert({
      id: 'worker',
      state: 'idle',
      updated_at: now,
      last_sync_at: now,
      last_seen: now,
      last_result: { ...prev, reason: chosen.reason, chunkTotal, ...result },
    }, { onConflict: 'id' });

    // Update chunk-specific row so the termux watcher knows when ALL chunks are done
    if (chunkTotal > 1) {
      await supa.from('worker_status').upsert({
        id: `worker-chunk-${chunkIndex}`,
        state: 'idle',
        updated_at: now,
        last_result: { chunkIndex, chunkTotal, ...result }
      }, { onConflict: 'id' });
    }
  } catch {
    // best-effort: a phone link can drop right after the test finishes.
  }
}

let heartbeatTimer;
async function heartbeat() {
  try {
    await supa.from('worker_status').upsert({
      id: 'worker',
      state: 'syncing',
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch { /* ignore */ }
}

(async () => {
  let result;
  try {
    await heartbeat();
    heartbeatTimer = setInterval(heartbeat, 15000);
    let basePercentage = 100;
    let detailsPercentage = 100;
    let aiFilteringEnabled = false;
    try {
      const { data: limits } = await supa.from('worker_settings').select('*').eq('id', 'global').maybeSingle();
      if (limits) {
        basePercentage = limits.base_pct ?? 100;
        aiFilteringEnabled = limits.ai_filtering ?? false;
        if (mode === 'wifi') detailsPercentage = limits.wifi_deep_pct ?? 100;
        else if (mode === 'lte') detailsPercentage = limits.lte_deep_pct ?? 100;
        else if (mode === 'whitelist') detailsPercentage = limits.wl_deep_pct ?? 100;
      }
    } catch { /* proceed with 100% defaults if fetch fails */ }

    result = await chosen.fn({
      chunkIndex: Number(process.env.TEST_CHUNK_INDEX) || 0,
      chunkTotal: Number(process.env.TEST_CHUNKS_TOTAL) || 1,
      basePercentage,
      detailsPercentage,
      aiFilteringEnabled
    });
    await recordStatus(result);
  } catch (e) {
    log.err(`Run failed: ${e.message}`);
    result = { error: e.message };
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await closeSupa();
  }
  console.log('\n' + JSON.stringify(result, null, 2));
  process.exit(result && result.error ? 1 : 0);
})();
