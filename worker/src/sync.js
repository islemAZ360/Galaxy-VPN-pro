import { supa } from './supa.js';
import { fetchRepoTexts } from './github.js';
import { extractConfigs, hashConfig, PROTOCOL_OF } from './parse.js';
import { flagEmoji, renameConfig } from './uri.js';
import { testAll, tcpTestAll } from './test.js';
import { lookupCountries } from './geoip.js';
import { log } from './log.js';

let running = false;

export function isRunning() {
  return running;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry transient failures (e.g. brief DNS/network blips on long runs).
async function withRetry(fn, { attempts = 4, baseMs = 1000, label = 'op' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      log.warn(`${label} attempt ${i + 1}/${attempts} failed: ${e.message}`);
      if (i < attempts - 1) await sleep(baseMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Two-phase VPN retry: after heavy xray-knife testing, the VPN/TUN adapter may
// have dropped. This retries the Supabase upload indefinitely (every 5s) until
// the connection is restored, so the admin just needs to reconnect VPN and the
// results upload automatically — no data is lost.
async function withVpnRetry(fn, { label = 'upload', intervalMs = 5000, maxAttempts = 120 } = {}) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 1) {
        log.warn(`╔══════════════════════════════════════════════════════════╗`);
        log.warn(`║  ⚠️  VPN/Network seems down — cannot reach Supabase     ║`);
        log.warn(`║  📡 Please reconnect your VPN now.                      ║`);
        log.warn(`║  🔄 Auto-retrying every 5s until connection is restored  ║`);
        log.warn(`╚══════════════════════════════════════════════════════════╝`);
      }
      if (i % 12 === 0) log.warn(`⏳ Still waiting for Supabase (${label})… attempt ${i}/${maxAttempts}. Please check VPN.`);
      await sleep(intervalMs);
    }
  }
  throw new Error(`${label}: gave up after ${maxAttempts} attempts — Supabase unreachable`);
}

// Naming: "🇩🇿 Algeria #2 | WIFI | LTE". The capability tags are cumulative —
const TIER_TAGS = { 
  wifi: ' | WIFI', 
  lte: ' | WIFI/LTE', 
  gemini_wifi: ' | WIFI/GEMINI', 
  gemini_lte: ' | WIFI/LTE/GEMINI' 
};

// Smart label: real flag+country when known; a neutral 🌐 + "Server" otherwise
// (no more blank-flag "Unknown"). Number only added when a country repeats.
function baseLabel(country, cc, numbered, idx) {
  const flag = cc ? flagEmoji(cc) : '🌐';
  return `${flag} ${country || 'Server'}${numbered ? ` #${idx}` : ''}`;
}

// Re-tag an existing name with a new tier, preserving its "flag country #n" base.
const retag = (name, tier) => `${(name || '').split(' | ')[0]}${TIER_TAGS[tier] || TIER_TAGS.wifi}`;

export async function runSync() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString() };
  console.log(''); // visual gap between runs
  log.step('Starting a sync cycle…');
  try {
    // 1. enabled repos
    const { data: repos, error: repoErr } = await supa.from('repos').select('repo_url').eq('enabled', true);
    if (repoErr) throw repoErr;
    stats.repos = repos?.length ?? 0;
    log.info(`Reading repos from Supabase  ·  ${stats.repos} enabled`);

    // 2. gather unique configs across all repos (hash -> { uri, source })
    //    Also track per-repo stats for the admin dashboard.
    log.info('Pulling .txt files from GitHub…');
    const configs = new Map();
    const repoStats = new Map(); // repo_url -> { files, extracted }
    for (const r of repos ?? []) {
      try {
        const { text, fileCount } = await fetchRepoTexts(r.repo_url);
        const repoConfigs = extractConfigs(text);
        log.info(`  · ${r.repo_url}  →  ${fileCount} files  →  ${repoConfigs.length} configs`);
        repoStats.set(r.repo_url, { files: fileCount, extracted: repoConfigs.length });
        for (const uri of repoConfigs) {
          configs.set(hashConfig(uri), { uri, source: r.repo_url });
        }
      } catch (e) {
        log.err(`repo failed ${r.repo_url}: ${e.message}`);
        repoStats.set(r.repo_url, { files: 0, extracted: 0, error: e.message });
      }
    }
    stats.discovered = configs.size;
    log.ok(`Discovered ${stats.discovered} unique server configs`);

    // GUARD: if we discovered nothing (e.g. GitHub was unreachable), DO NOT wipe
    // the existing pool. Abort the run so a transient network blip can't delete
    // every server. The pool is preserved; the next successful run refreshes it.
    if (stats.discovered === 0) {
      log.warn('Discovered 0 configs (repos unreachable?) — keeping the existing pool untouched.');
      stats.finishedAt = new Date().toISOString();
      stats.aborted = 'no-configs';
      return stats;
    }

    // 3. test all extracted configs (in batches to show progress).
    // If MAX_CONFIGS is set > 0, we cap the testing pool to save time.
    // Otherwise, we test everything.
    const allUris = [...configs.values()].map((c) => c.uri);
    const MAX = Number(process.env.MAX_CONFIGS || 0);
    let candidates = allUris;
    if (MAX > 0 && allUris.length > MAX) {
      // Sample evenly instead of just taking the first N
      const stride = allUris.length / MAX;
      candidates = Array.from({ length: MAX }, (_, k) => allUris[Math.floor(k * stride)]);
    }
    stats.candidates = candidates.length;
    
    const TCP_CONC = 300;
    log.info(`Pre-filtering ${stats.candidates} configs via fast TCP ping (concurrency ${TCP_CONC})…`);
    
    let tcpWorking = [];
    let tcpTestedCount = 0;
    const tcpBatches = chunk(candidates, 5000);
    
    for (let i = 0; i < tcpBatches.length; i++) {
      const b = tcpBatches[i];
      // Quick 3.0s TCP ping to weed out totally dead IPs
      const res = await tcpTestAll(b, { concurrency: TCP_CONC, timeoutMs: 3000 });
      tcpWorking.push(...res.filter((r) => r.ok).map((r) => r.uri));
      tcpTestedCount += b.length;
      log.progress((tcpTestedCount / stats.candidates) * 100, `TCP: ${tcpWorking.length} alive`);
    }
    log.clearProgress();
    log.ok(`TCP filter: ${tcpWorking.length}/${stats.candidates} configs are reachable`);

    if (tcpWorking.length === 0) {
      log.warn('0 reachable configs. Aborting sync.');
      stats.working = 0;
      stats.finishedAt = new Date().toISOString();
      return stats;
    }

    const CONC = Number(process.env.TEST_CONCURRENCY || 50);
    log.info(`Deep testing ${tcpWorking.length} candidates via xray-knife (concurrency ${CONC})…`);
    
    const working = [];
    // Larger batch size for xray-knife now that dead IPs are gone
    const BATCH_SIZE = 500; 
    const candidateBatches = chunk(tcpWorking, BATCH_SIZE);
    let testedCount = 0;

    for (let i = 0; i < candidateBatches.length; i++) {
      const b = candidateBatches[i];
      const results = await testAll(b, { concurrency: CONC, timeoutMs: 4000 });
      const batchWorking = results.filter((r) => r.ok);
      working.push(...batchWorking);
      testedCount += b.length;
      log.progress((testedCount / tcpWorking.length) * 100, `Xray: ${working.length} passed`);
    }
    log.clearProgress();

    stats.working = working.length;
    log.ok(`${stats.working} / ${stats.candidates} servers passed the real test`);

    // let lingering sockets drain before HTTP fetch calls (Windows TIME_WAIT)
    await sleep(Number(process.env.DRAIN_MS || 2000));

    // 4. geoip for working hosts
    log.info('Looking up country / flag for each working host…');
    const geo = await lookupCountries(working.map((w) => w.host));

    // 5. Smart rename: sort by country (then latency), number per country, and
    // rewrite BOTH the display name and the config's own remark so the clean
    // "🇩🇿 Algeria #1" name shows in the admin panel AND in the user's app (Happ).
    // Fetch existing servers to preserve their network_type and tags
    const existingBefore = await withRetry(async () => {
      const { data, error } = await supa.from('servers').select('config_hash, network_type, is_deleted');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-existing-before' });
    const existingTiers = new Map(existingBefore.map(s => [s.config_hash, s.network_type]));
    const existingDeleted = new Set(existingBefore.filter(s => s.is_deleted).map(s => s.config_hash));

    const now = new Date().toISOString();
    const sorted = [...working].sort((a, b) => {
      const ca = geo.get(a.host)?.country || 'ZZZ';
      const cb = geo.get(b.host)?.country || 'ZZZ';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity);
    });
    const counters = {};
    const rows = sorted
      .filter((w) => !existingDeleted.has(hashConfig(w.uri)))
      .map((w) => {
      const hash = hashConfig(w.uri);
      const g = geo.get(w.host) || {};
      
      let country = g.country;
      let cc = g.country_code ?? null;
      if (!country) {
        country = 'Server';
      }
      
      counters[country] = (counters[country] || 0) + 1;
      const baseName = `${flagEmoji(cc)} ${country} #${counters[country]}`;
      
      const tier = existingTiers.get(hash) || 'wifi';
      const displayName = retag(baseName, tier);
      
      return {
        name: displayName,
        country: g.country ?? null,
        country_code: cc,
        protocol: PROTOCOL_OF(w.uri),
        config_uri: renameConfig(w.uri, displayName), // what the user sees in Happ
        config_hash: hash, // hash the ORIGINAL uri = stable identity
        latency_ms: w.latencyMs,
        is_working: true,
        network_type: tier,
        source_repo: configs.get(hash)?.source ?? null,
        last_checked_at: now,
        updated_at: now,
      };
    });
    // upsert in chunks (resilient to transient network errors)
    log.info(`Renaming + uploading ${rows.length} working servers to Supabase…`);
    for (const part of chunk(rows, 500)) {
      await withRetry(async () => {
        const { error } = await supa.from('servers').upsert(part, { onConflict: 'config_hash' });
        if (error) throw new Error(error.message);
      }, { label: 'upsert' });
    }

    // 6. delete servers no longer working (not in current working set)
    const keep = new Set(rows.map((r) => r.config_hash));
    const existing = await withRetry(async () => {
      const { data, error } = await supa.from('servers').select('id, config_hash, is_deleted');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-existing' });
    const toDelete = existing.filter((s) => !keep.has(s.config_hash) && !s.is_deleted).map((s) => s.id);
    stats.deleted = toDelete.length;
    if (stats.deleted) {
      log.info(`Deleting ${stats.deleted} stale servers…`);
      for (const batch of chunk(toDelete, 100)) {
        await withRetry(async () => {
          const { error } = await supa.from('servers').delete().in('id', batch);
          if (error) throw new Error(error.message);
        }, { label: 'delete' });
      }
    }

    // 7. Compute per-repo stats and save to repo_stats table
    log.info('Computing per-repo statistics…');
    try {
      const { data: liveServers } = await supa
        .from('servers')
        .select('source_repo, network_type')
        .eq('is_working', true)
        .eq('is_deleted', false);

      // Build per-repo working/wifi/lte/gemini counts from live DB data
      const liveByRepo = new Map();
      for (const s of liveServers ?? []) {
        const repo = s.source_repo;
        if (!repo) continue;
        if (!liveByRepo.has(repo)) liveByRepo.set(repo, { working: 0, wifi: 0, lte: 0, gemini: 0 });
        const r = liveByRepo.get(repo);
        r.working++;
        if (s.network_type === 'wifi') r.wifi++;
        else if (s.network_type === 'lte') r.lte++;
        else if (s.network_type === 'gemini_wifi' || s.network_type === 'gemini_lte') r.gemini++;
      }

      const syncTime = new Date().toISOString();
      const statRows = [];
      for (const [repoUrl, rs] of repoStats) {
        const live = liveByRepo.get(repoUrl) || { working: 0, wifi: 0, lte: 0, gemini: 0 };
        statRows.push({
          repo_url: repoUrl,
          files_found: rs.files,
          configs_extracted: rs.extracted,
          configs_working: live.working,
          wifi_count: live.wifi,
          lte_count: live.lte,
          gemini_count: live.gemini,
          last_sync_at: syncTime,
          updated_at: syncTime,
        });
      }

      if (statRows.length > 0) {
        await withRetry(async () => {
          const { error } = await supa.from('repo_stats').upsert(statRows, { onConflict: 'repo_url' });
          if (error) throw new Error(error.message);
        }, { label: 'upsert-repo-stats' });
        log.ok(`Saved stats for ${statRows.length} repos`);
      }
    } catch (e) {
      log.warn(`repo_stats save failed (non-fatal): ${e.message}`);
    }

    stats.finishedAt = new Date().toISOString();
    log.done(`Done — ${stats.working} live · ${stats.deleted} removed · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt))/1000)}s`);
    return stats;
  } catch (e) {
    log.err(`Sync failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}

// LTE re-check: retest the servers ALREADY in the pool over the worker's current
// (LTE) connection. Those that still pass become 'lte' (work on mobile + Wi-Fi);
// the rest are demoted to 'wifi' only. Nothing is deleted here.
// Run this while the machine is on LTE / a phone hotspot.
export async function runLteRecheck() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'lte' };
  // name-independent key so xray-knife's output matches our (renamed) DB rows
  const keyOf = (u) => renameConfig(u, '');
  console.log('');
  log.step('LTE re-check — testing the live pool over THIS connection…');
  try {
    const existing = await withRetry(async () => {
      const { data, error } = await supa.from('servers').select('id, config_uri, network_type');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-pool' });
    stats.total = existing.length;
    if (!stats.total) {
      log.warn('No servers in the pool to re-check yet — run a normal sync first.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    // ──────── PHASE 1: Test servers (heavy network, may drop VPN) ────────
    const CONC = Number(process.env.TEST_CONCURRENCY || 50);
    log.info(`Phase 1 — Re-testing ${stats.total} servers over the current network (concurrency ${CONC})…`);
    const results = await testAll(existing.map((s) => s.config_uri), { concurrency: CONC, timeoutMs: 4000 });
    const workingKeys = new Set(results.filter((r) => r.ok).map((r) => keyOf(r.uri)));

    const geminiWifiIds = [];
    const geminiLteIds = [];
    const lteIds = [];
    const wifiIds = [];
    for (const s of existing) {
      if (workingKeys.has(keyOf(s.config_uri))) {
        // Passed LTE test
        if (s.network_type === 'gemini_wifi' || s.network_type === 'gemini_lte') geminiLteIds.push(s.id);
        else lteIds.push(s.id);
      } else {
        // Failed LTE test (demoted to wifi only)
        if (s.network_type === 'gemini_wifi' || s.network_type === 'gemini_lte') geminiWifiIds.push(s.id);
        else wifiIds.push(s.id);
      }
    }
    stats.gemini_lte = geminiLteIds.length;
    stats.gemini_wifi = geminiWifiIds.length;
    stats.lte = lteIds.length;
    stats.wifi = wifiIds.length;
    stats.gemini = stats.gemini_lte + stats.gemini_wifi;
    // ──────── PHASE 2: Upload results to Supabase ────────
    // VPN may have dropped during the heavy xray-knife phase above.
    // withVpnRetry keeps trying until Supabase is reachable again.
    log.step('Phase 2 — Uploading results to Supabase…');

    const now = new Date().toISOString();
    const classifyWithRetry = async (ids, type) => {
      await withVpnRetry(async () => {
        const { data: current, error: selErr } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', ids);
        if (selErr) throw new Error(selErr.message);
        if (!current) return;
        
        const updates = current.map(c => {
          const newName = retag(c.name, type);
          return {
            id: c.id,
            name: newName,
            config_uri: renameConfig(c.config_uri, newName),
            config_hash: c.config_hash,
            network_type: type,
            last_checked_at: now
          };
        });

        for (const batch of chunk(updates, 200)) {
          const { error } = await supa.from('servers').upsert(batch, { onConflict: 'id' });
          if (error) throw new Error(error.message);
        }
      }, { label: `classify-${type}` });
    };
    await classifyWithRetry(geminiLteIds, 'gemini_lte');
    await classifyWithRetry(geminiWifiIds, 'gemini_wifi');
    await classifyWithRetry(lteIds, 'lte');
    await classifyWithRetry(wifiIds, 'wifi');

    stats.finishedAt = new Date().toISOString();
    log.done(`LTE re-check done — ${stats.gemini} Gemini (${stats.gemini_lte} on LTE) · ${stats.lte} LTE · ${stats.wifi} Wi-Fi · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt)) / 1000)}s`);
    return stats;
  } catch (e) {
    log.err(`LTE re-check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}

const GEMINI_URL = process.env.GEMINI_TEST_URL || 'https://generativelanguage.googleapis.com/';

// Gemini / Wi-Fi re-check: tests only the 'wifi' servers to see if they reach Gemini.
export async function runGeminiWifiRecheck() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'gemini_wifi' };
  const keyOf = (u) => renameConfig(u, '');
  console.log('');
  log.step(`Gemini / Wi-Fi re-check — testing against ${GEMINI_URL}…`);
  try {
    const existing = await withRetry(async () => {
      const { data, error } = await supa.from('servers').select('id, config_uri').eq('network_type', 'wifi');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-pool-wifi' });
    stats.total = existing.length;
    if (!stats.total) {
      log.warn('No Wi-Fi servers in the pool to check for Gemini.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    log.info(`Testing ${stats.total} Wi-Fi servers for Gemini reachability…`);
    const CONC = Number(process.env.TEST_CONCURRENCY || 50);
    const results = await testAll(existing.map((s) => s.config_uri), {
      concurrency: CONC,
      timeoutMs: 4000,
      url: GEMINI_URL,
    });
    const okKeys = new Set(results.filter((r) => r.ok).map((r) => keyOf(r.uri)));

    const geminiIds = [];
    const wifiIds = [];
    for (const s of existing) {
      if (okKeys.has(keyOf(s.config_uri))) geminiIds.push(s.id);
      else wifiIds.push(s.id);
    }
    stats.gemini = geminiIds.length;
    log.ok(`${stats.gemini} reach Gemini over Wi-Fi  ·  ${wifiIds.length} are Wi-Fi only`);

    const now = new Date().toISOString();
    const classify = async (ids, type) => {
      const { data: current } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', ids);
      if (!current) return;
      const updates = current.map(c => {
        const newName = retag(c.name, type);
        return {
          id: c.id,
          name: newName,
          config_uri: renameConfig(c.config_uri, newName),
          config_hash: c.config_hash,
          network_type: type,
          last_checked_at: now
        };
      });
      for (const batch of chunk(updates, 200)) {
        await withRetry(async () => {
          const { error } = await supa.from('servers').upsert(batch, { onConflict: 'id' });
          if (error) throw new Error(error.message);
        }, { label: `classify-${type}` });
      }
    };
    await classify(geminiIds, 'gemini_wifi');
    await classify(wifiIds, 'wifi');

    stats.finishedAt = new Date().toISOString();
    log.done(`Gemini / Wi-Fi re-check done — ${stats.gemini} Gemini / Wi-Fi · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt)) / 1000)}s`);
    return stats;
  } catch (e) {
    log.err(`Gemini / Wi-Fi re-check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}

// Gemini / LTE re-check: tests only the 'lte' servers to see if they reach Gemini.
export async function runGeminiLteRecheck() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'gemini_lte' };
  const keyOf = (u) => renameConfig(u, '');
  console.log('');
  log.step(`Gemini / LTE re-check — testing against ${GEMINI_URL}…`);
  try {
    const existing = await withRetry(async () => {
      const { data, error } = await supa.from('servers').select('id, config_uri').eq('network_type', 'lte');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-pool-lte' });
    stats.total = existing.length;
    if (!stats.total) {
      log.warn('No LTE servers in the pool to check for Gemini.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    // ──────── PHASE 1: Test servers (heavy network, may drop VPN) ────────
    const CONC = Number(process.env.TEST_CONCURRENCY || 50);
    log.info(`Phase 1 — Testing ${stats.total} LTE servers for Gemini reachability (concurrency ${CONC})…`);
    const results = await testAll(existing.map((s) => s.config_uri), {
      concurrency: CONC,
      timeoutMs: 4000,
      url: GEMINI_URL,
    });
    const okKeys = new Set(results.filter((r) => r.ok).map((r) => keyOf(r.uri)));

    const geminiIds = [];
    const lteIds = [];
    for (const s of existing) {
      if (okKeys.has(keyOf(s.config_uri))) geminiIds.push(s.id);
      else lteIds.push(s.id);
    }
    stats.gemini = geminiIds.length;
    log.ok(`${stats.gemini} reach Gemini over LTE  ·  ${lteIds.length} are LTE only`);

    // ──────── PHASE 2: Upload results to Supabase ────────
    log.step('Phase 2 — Uploading results to Supabase…');

    const now = new Date().toISOString();
    const classifyWithRetry = async (ids, type) => {
      await withVpnRetry(async () => {
        const { data: current, error: selErr } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', ids);
        if (selErr) throw new Error(selErr.message);
        if (!current) return;
        const updates = current.map(c => {
          const newName = retag(c.name, type);
          return {
            id: c.id,
            name: newName,
            config_uri: renameConfig(c.config_uri, newName),
            config_hash: c.config_hash,
            network_type: type,
            last_checked_at: now
          };
        });
        for (const batch of chunk(updates, 200)) {
          const { error } = await supa.from('servers').upsert(batch, { onConflict: 'id' });
          if (error) throw new Error(error.message);
        }
      }, { label: `classify-${type}` });
    };
    await classifyWithRetry(geminiIds, 'gemini_lte');
    await classifyWithRetry(lteIds, 'lte');

    stats.finishedAt = new Date().toISOString();
    log.done(`Gemini / LTE re-check done — ${stats.gemini} Gemini / LTE · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt)) / 1000)}s`);
    return stats;
  } catch (e) {
    log.err(`Gemini / LTE re-check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}

// Latency re-check: Just pings servers via TCP to update their latency_ms
export async function runLatencyCheck() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'latency' };
  console.log('');
  log.step('Latency check — Ping testing all live servers…');
  try {
    const existing = await withRetry(async () => {
      const { data, error } = await supa.from('servers').select('id, config_uri');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-pool' });
    
    stats.total = existing.length;
    if (!stats.total) {
      log.warn('No servers to check latency.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    
    log.info(`Pinging ${stats.total} servers for latency…`);
    const CONC = 100; // TCP pings are lightweight, can go higher
    const results = await tcpTestAll(existing.map((s) => s.config_uri), {
      concurrency: CONC,
      timeoutMs: 4000,
    });
    
    const idToUri = new Map(existing.map((s) => [s.config_uri, s.id]));
    const updates = [];
    
    for (const r of results) {
      const id = idToUri.get(r.uri);
      if (id && r.latencyMs !== null) {
        updates.push({ id, latency_ms: r.latencyMs, updated_at: new Date().toISOString() });
      }
    }
    
    stats.updated = updates.length;
    if (updates.length > 0) {
      log.info(`Updating latency for ${updates.length} servers…`);
      for (const batch of chunk(updates, 500)) {
        await withRetry(async () => {
          const { error } = await supa.from('servers').upsert(batch);
          if (error) throw new Error(error.message);
        }, { label: 'update-latency' });
      }
    }

    stats.finishedAt = new Date().toISOString();
    log.done(`Done — updated latencies for ${stats.updated} servers · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt))/1000)}s`);
    return stats;
  } catch (e) {
    log.err(`Latency check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}
