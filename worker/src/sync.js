import { supa } from './supa.js';
import { fetchRepoTexts } from './github.js';
import { extractConfigs, hashConfig, PROTOCOL_OF } from './parse.js';
import { flagEmoji, renameConfig } from './uri.js';
import { testAll } from './test.js';
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
      console.error(`[sync] ${label} attempt ${i + 1}/${attempts} failed:`, e.message);
      if (i < attempts - 1) await sleep(baseMs * 2 ** i);
    }
  }
  throw lastErr;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Naming: "🇩🇿 Algeria #2 | WIFI | LTE". The capability tags are cumulative —
// gemini servers also work on lte+wifi, lte servers also work on wifi.
const TIER_TAGS = { wifi: ' | WIFI', lte: ' | WIFI | LTE', gemini: ' | WIFI | LTE | GEMINI' };

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
    log.info('Pulling .txt files from GitHub…');
    const configs = new Map();
    for (const r of repos ?? []) {
      try {
        const { text, fileCount } = await fetchRepoTexts(r.repo_url);
        log.info(`  · ${r.repo_url}  →  ${fileCount} files`);
        for (const uri of extractConfigs(text)) {
          configs.set(hashConfig(uri), { uri, source: r.repo_url });
        }
      } catch (e) {
        log.err(`repo failed ${r.repo_url}: ${e.message}`);
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

    // 3. test a bounded, evenly-spread sample of candidates.
    // Testing thousands of hosts exhausts OS sockets (esp. on Windows) and
    // breaks later fetch() calls. MAX_CONFIGS keeps the pool healthy and the
    // run reliable; raise it via env on a beefier host.
    const allUris = [...configs.values()].map((c) => c.uri);
    const MAX = Number(process.env.MAX_CONFIGS || 800);
    let candidates = allUris;
    if (allUris.length > MAX) {
      const stride = allUris.length / MAX;
      candidates = Array.from({ length: MAX }, (_, k) => allUris[Math.floor(k * stride)]);
    }
    stats.candidates = candidates.length;
    const CONC = Number(process.env.TEST_CONCURRENCY || 40);
    log.info(`Testing ${stats.candidates} candidates via xray-knife (concurrency ${CONC})…`);
    const results = await testAll(candidates, { concurrency: CONC, timeoutMs: 4000 });
    const working = results.filter((r) => r.ok);
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
      const { data, error } = await supa.from('servers').select('config_hash, network_type');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-existing-before' });
    const existingTiers = new Map(existingBefore.map(s => [s.config_hash, s.network_type]));

    const now = new Date().toISOString();
    const sorted = [...working].sort((a, b) => {
      const ca = geo.get(a.host)?.country || 'ZZZ';
      const cb = geo.get(b.host)?.country || 'ZZZ';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity);
    });
    const counters = {};
    const rows = sorted.map((w) => {
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
      const { data, error } = await supa.from('servers').select('id, config_hash');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-existing' });
    const toDelete = existing.filter((s) => !keep.has(s.config_hash)).map((s) => s.id);
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
      const { data, error } = await supa.from('servers').select('id, config_uri');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-pool' });
    stats.total = existing.length;
    if (!stats.total) {
      log.warn('No servers in the pool to re-check yet — run a normal sync first.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    log.info(`Re-testing ${stats.total} servers over the current network…`);
    const CONC = Number(process.env.TEST_CONCURRENCY || 40);
    const results = await testAll(existing.map((s) => s.config_uri), { concurrency: CONC, timeoutMs: 4000 });
    const workingKeys = new Set(results.filter((r) => r.ok).map((r) => keyOf(r.uri)));

    const lteIds = [];
    const wifiIds = [];
    for (const s of existing) (workingKeys.has(keyOf(s.config_uri)) ? lteIds : wifiIds).push(s.id);
    stats.lte = lteIds.length;
    stats.wifi = wifiIds.length;
    log.ok(`${stats.lte} work on LTE  ·  ${stats.wifi} are Wi-Fi only`);

    const now = new Date().toISOString();
    const classify = async (ids, type) => {
      const { data: current } = await supa.from('servers').select('id, name, config_uri').in('id', ids);
      if (!current) return;
      
      const updates = current.map(c => {
        const newName = retag(c.name, type);
        return {
          id: c.id,
          name: newName,
          config_uri: renameConfig(c.config_uri, newName),
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
    await classify(lteIds, 'lte');
    await classify(wifiIds, 'wifi');

    stats.finishedAt = new Date().toISOString();
    log.done(`LTE re-check done — ${stats.lte} LTE · ${stats.wifi} Wi-Fi · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt)) / 1000)}s`);
    return stats;
  } catch (e) {
    log.err(`LTE re-check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}

// Gemini re-check: retest the live pool but aim the connectivity test at a
// Gemini endpoint. Servers that can REACH Gemini through the proxy become
// 'gemini' (premium tier); the rest are demoted to 'lte'. Run on LTE.
const GEMINI_URL = process.env.GEMINI_TEST_URL || 'https://generativelanguage.googleapis.com/';
export async function runGeminiRecheck() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'gemini' };
  const keyOf = (u) => renameConfig(u, '');
  console.log('');
  log.step(`Gemini re-check — testing the pool against ${GEMINI_URL}…`);
  try {
    const existing = await withRetry(async () => {
      const { data, error } = await supa.from('servers').select('id, config_uri');
      if (error) throw new Error(error.message);
      return data ?? [];
    }, { label: 'select-pool' });
    stats.total = existing.length;
    if (!stats.total) {
      log.warn('No servers in the pool yet — run a normal sync first.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    log.info(`Testing ${stats.total} servers for Gemini reachability…`);
    const CONC = Number(process.env.TEST_CONCURRENCY || 40);
    const results = await testAll(existing.map((s) => s.config_uri), {
      concurrency: CONC,
      timeoutMs: 4000,
      url: GEMINI_URL,
    });
    const okKeys = new Set(results.filter((r) => r.ok).map((r) => keyOf(r.uri)));

    const geminiIds = [];
    const lteIds = [];
    for (const s of existing) (okKeys.has(keyOf(s.config_uri)) ? geminiIds : lteIds).push(s.id);
    stats.gemini = geminiIds.length;
    stats.lte = lteIds.length;
    log.ok(`${stats.gemini} reach Gemini  ·  ${stats.lte} demoted to LTE`);

    const now = new Date().toISOString();
    const classify = async (ids, type) => {
      // First, fetch existing names to retag them
      const { data: current } = await supa.from('servers').select('id, name, config_uri').in('id', ids);
      if (!current) return;
      
      const updates = current.map(c => {
        const newName = retag(c.name, type);
        return {
          id: c.id,
          name: newName,
          config_uri: renameConfig(c.config_uri, newName),
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
    await classify(geminiIds, 'gemini');
    await classify(lteIds, 'lte');

    stats.finishedAt = new Date().toISOString();
    log.done(`Gemini re-check done — ${stats.gemini} Gemini · ${stats.lte} LTE · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt)) / 1000)}s`);
    return stats;
  } catch (e) {
    log.err(`Gemini re-check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}
