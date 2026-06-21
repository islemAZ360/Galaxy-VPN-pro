import { supa } from './supa.js';
import { hashConfig, PROTOCOL_OF } from './parse.js';
import { flagEmoji, renameConfig } from './uri.js';
import { testAll, tcpTestAll } from './test.js';
import { lookupCountries } from './geoip.js';
import { classifyGeminiPool, isCountryGeminiBlocked } from './gemini.js';
import { log, C } from './log.js';

// ── User-pool quality gate (applied when the Wi-Fi cascade builds the live pool).
// Drops servers users should never receive, using data we ALREADY have (host
// country + the LOCAL Russia-measured latency) — so it adds no scan time.
//   EXCLUDE_HOST_CC: hosts in these countries are pointless for bypassing Russia's
//     censorship (Russia/Belarus). Set EXCLUDE_HOST_CC='' to disable.
//   MAX_LATENCY_MS: servers slower than this (measured HERE, from Russia — not
//     GitHub's US runner) never enter the pool; a 5000ms server is dead-on-arrival.
const EXCLUDE_HOST_CC = new Set(
  (process.env.EXCLUDE_HOST_CC ?? 'RU,BY').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
);
const MAX_LATENCY_MS = Number(process.env.MAX_LATENCY_MS) || 1000;

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

// GitHub liveness pre-filter (SAFE + REVERSIBLE). Skips configs that the GitHub
// Action (worker/src/liveness-scan.js) positively confirmed DEAD, so the local
// deep-test only runs on known/likely-alive servers. Russia-hosted servers are
// force-kept by the scan, so they're never skipped here. No-op when the
// `candidates` table is empty/missing/unreachable; never reduces to empty.
async function skipKnownDead(uris) {
  try {
    const data = await fetchAllPaginated('candidates', 'config_hash', { alive: false });
    if (!data || data.length === 0) return uris;
    const dead = new Set(data.map((d) => d.config_hash));
    const kept = uris.filter((u) => !dead.has(hashConfig(u)));
    const skipped = uris.length - kept.length;
    if (skipped > 0 && kept.length > 0) {
      log.info(`GitHub liveness: skipping ${skipped} server(s) confirmed dead — deep-testing ${kept.length} alive/unknown.`);
      return kept;
    }
    return uris;
  } catch (e) {
    log.warn(`Liveness pre-filter unavailable (${e.message}) — testing all candidates.`);
    return uris;
  }
}

// Two-phase VPN retry: after heavy xray-knife testing, the VPN/TUN adapter may
// have dropped. This retries the Supabase upload indefinitely (every 5s) until
// the connection is restored, so the admin just needs to reconnect VPN and the
// results upload automatically — no data is lost.
async function withVpnRetry(fn, { label = 'upload', intervalMs = 5000, maxAttempts = 120 } = {}) {
  for (let i = 1; i <= maxAttempts; i++) {
    if (i === 1) log.info(`Connecting to Supabase (${label})…`);
    try {
      return await fn();
    } catch (e) {
      if (i === 1) {
        log.warn(`╔══════════════════════════════════════════════════════════╗`);
        log.warn(`║  ⚠️  VPN/Network seems down — cannot reach Supabase     ║`);
        log.warn(`║  Error: ${e.message.substring(0, 50)}`);
        log.warn(`║  📡 Please reconnect your VPN now.                      ║`);
        log.warn(`║  🔄 Auto-retrying every 5s until connection is restored  ║`);
        log.warn(`╚══════════════════════════════════════════════════════════╝`);
      }
      if (i % 3 === 0) log.warn(`⏳ Still waiting for Supabase (${label})… attempt ${i}/${maxAttempts}. Error: ${e.message}`);
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
  gemini_lte: ' | WIFI/LTE/GEMINI',
  whitelist: ' | WIFI/LTE/WhiteList',
  gemini_whitelist: ' | WIFI/LTE/GEMINI/WhiteList',
};

// Smart label: real flag+country when known; a neutral 🌐 + "Server" otherwise
// (no more blank-flag "Unknown"). Number only added when a country repeats.
function baseLabel(country, cc, numbered, idx) {
  const flag = cc ? flagEmoji(cc) : '🌐';
  return `${flag} ${country || 'Server'}${numbered ? ` #${idx}` : ''}`;
}

// Re-tag an existing name with a new tier, preserving its "flag country #n" base.
const retag = (name, tier) => `${(name || '').split(' | ')[0]}${TIER_TAGS[tier] || TIER_TAGS.wifi}`;

// ===========================================================================
// TWO-BUTTON CASCADES (Wi-Fi and LTE). Each runs two phases in one go:
//   Wi-Fi button → Phase 1: Wi-Fi DPI test   → Phase 2: Gemini split
//   LTE   button → Phase 1: LTE DPI test      → Phase 2: Gemini split
//
// The tier is two INDEPENDENT dimensions: NETWORK (wifi | wifi+lte) × GEMINI
// (no | yes) → wifi / lte / gemini_wifi / gemini_lte. The Wi-Fi button sets the
// Gemini dimension and PRESERVES the existing LTE dimension; the LTE button sets
// the LTE dimension. Gemini is derived for FREE from GitHub's measured egress
// country (candidates.exit_cc) — only servers with an unknown country are probed
// locally. VPN must be ON for DB access and OFF during the real test.
// ===========================================================================

// name-independent key so test output matches our (renamed) DB rows
const keyOf = (u) => renameConfig(u, '');

// Helper to paginate any Supabase fetch to avoid payload/connection crashes.
// Each page is wrapped in withRetry() so a single page dropped by a flaky VPN
// is retried instead of aborting the whole load.
//
// PAGE SIZE = 20 (env: SUPA_PAGE_SIZE). Empirically, Russian DPI on LTE+VPN
// lets response payloads up to ~6KB through and stalls larger ones mid-stream
// (20 rows × ~300-char config_uri ≈ 6KB succeeds; 30 rows hangs forever). A
// ~4000-server pool → 200 requests × ~330ms ≈ 66s, acceptable. If DPI relaxes,
// raise SUPA_PAGE_SIZE; if it tightens, lower it.
//   - attempts: 8 (seven silent retries) with 1s base backoff. On a Russian
//     LTE+VPN link DPI stalls are frequent and can last several pages in a
//     row; 8 attempts × 12s = 96s budget per page before handing to the outer
//     withVpnRetry(). Most stalls clear within 2-3 retries.
//   - a randomized pause between SUCCESSFUL pages so the request pattern
//     doesn't look like a tight burst (DPI is pattern-sensitive). A fixed
//     delay is itself a detectable pattern, so we jitter ±50% around the
//     base. Tunable via SUPA_PAGE_DELAY_MS (base, default 500); set to 0 to
//     disable. Also pause briefly after a failed page's retry to let any
//     DPI state cool down.
async function fetchAllPaginated(table, select, filters = {}) {
  let allData = [];
  let from = 0;
  const size = Math.max(1, Number(process.env.SUPA_PAGE_SIZE) || 20);
  const baseDelay = Math.max(0, Number(process.env.SUPA_PAGE_DELAY_MS) || 500);
  const jitter = () => baseDelay ? baseDelay * (0.5 + Math.random()) : 0;
  log.info(`Fetching ${table} (page ${size})…`);
  while (true) {
    const fromIdx = from;
    const { data, error } = await withRetry(async () => {
      let q = supa.from(table).select(select).range(fromIdx, fromIdx + size - 1);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const r = await q;
      if (r.error) throw new Error(r.error.message);
      return r;
    }, { attempts: 8, baseMs: 1500, label: `paginate ${table}@${fromIdx}` });
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (allData.length % 200 < size) log.info(`Loaded ${allData.length} ${table} rows…`);
    if (data.length < size) break;
    from += size;
    if (jitter()) await sleep(jitter());
  }
  return allData;
}

// Source the Wi-Fi test pool from the GitHub-maintained `candidates` (alive).
// Returns { uris, meta } where meta maps keyOf(uri) → { exit_cc, source_repo }.
async function loadAliveCandidates() {
  let data;
  try {
    // host_cc/host_country are precomputed by the GitHub scan so we skip ip-api here.
    data = await fetchAllPaginated('candidates', 'config_uri, exit_cc, source_repo, host_cc, host_country', { alive: true });
  } catch {
    // Columns not migrated yet → fall back; ip-api fills the country gap locally.
    data = await fetchAllPaginated('candidates', 'config_uri, exit_cc, source_repo', { alive: true });
  }
  if (!data || data.length === 0) {
    return { uris: [], meta: new Map(), source: 'GitHub candidates (empty)' };
  }
  const meta = new Map();
  for (const c of data) meta.set(keyOf(c.config_uri), {
    exit_cc: c.exit_cc || null,
    source_repo: c.source_repo || null,
    host_cc: c.host_cc || null,
    host_country: c.host_country || null,
  });
  return { uris: data.map((c) => c.config_uri), meta, source: 'GitHub candidates' };
}

async function deepTest(uris, { conc, timeoutMs = 4000, batchSize = 100, phaseLabel = 'Test' }) {
  const working = [];
  const batches = chunk(uris, batchSize);
  let tested = 0;
  log.progress(0, `${phaseLabel}: 0 passed`);
  for (const b of batches) {
    const results = await testAll(b, { concurrency: conc, timeoutMs });
    working.push(...results.filter((r) => r.ok));
    tested += b.length;
    log.progress((tested / Math.max(1, uris.length)) * 100, `${phaseLabel}: ${working.length} passed`);
    
    // Short cooling delay between batches — only Windows' Wi-Fi driver needs it;
    // skip it elsewhere (e.g. the phone/Termux on Linux) to save time.
    if (process.platform === 'win32' && tested < uris.length) {
      await sleep(1000);
    }
  }
  log.clearProgress();
  return working;
}

// Decide which URIs reach Gemini. Uses GitHub's egress country (instant) when
// known; only probes the unknowns locally. Returns a Set of keyOf(uri).
async function geminiKeysFor(uris, meta) {
  const geminiKeys = new Set();
  const unknown = [];
  for (const uri of uris) {
    const k = keyOf(uri);
    const cc = meta.get(k)?.exit_cc;
    if (cc) { if (!isCountryGeminiBlocked(cc)) geminiKeys.add(k); }
    else unknown.push(uri);
  }
  if (unknown.length) {
    log.info(`Gemini: ${unknown.length} server(s) have no known egress country — probing locally…`);
    const results = await classifyGeminiPool(unknown, { onProgress: (p, l) => log.progress(p, `Gemini — ${l}`) });
    log.clearProgress();
    for (const r of results) if (r && r.ok) geminiKeys.add(keyOf(r.uri));
  }
  return geminiKeys;
}

// VPN choreography: OFF for the real test, ON for the DB.
async function vpnOffGate(connectionMsg) {
  log.panel('🛑  ACTION REQUIRED: TURN OFF VPN', [
    connectionMsg,
    'The DPI test must run on your REAL local connection.',
    'Testing starts automatically in 15 seconds...'
  ], C.red);
  await log.countdown(15);
  log.ok('Testing now!');
}
function vpnOnPrompt() {
  log.panel('✅  TESTING FINISHED', [
    'TURN YOUR VPN BACK ON NOW.',
    'We need a secure connection to upload results to Supabase.'
  ], C.emerald);
}

const elapsed = (stats) => Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt)) / 1000);

// ───────────────────────── Wi-Fi button cascade ───────────────────────────
// Pool = GitHub-verified candidates → Phase 1 Wi-Fi DPI → Phase 2 Gemini.
// Sets the base tier (wifi/gemini_wifi) and PRESERVES the LTE dimension.
export async function runWifiCascade() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'wifi' };
  console.log('');
  log.step('Wi-Fi re-check  ·  Phase 1: Wi-Fi DPI  →  Phase 2: Gemini');
  try {
    log.info('Loading GitHub-verified candidates (keep VPN ON)…');
    const { uris, meta, source } = await withVpnRetry(loadAliveCandidates, { label: 'load-candidates' });
    stats.total = uris.length;
    if (!stats.total) {
      log.warn('No candidates to test — run the GitHub liveness scan first.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    log.ok(`${stats.total} candidate(s) from ${source}.`);

    // Capture existing tiers (to preserve the LTE dimension) before going offline.
    const existingBefore = await withVpnRetry(async () => {
      return await fetchAllPaginated('servers', 'config_hash, network_type, is_deleted');
    }, { label: 'select-existing' });
    const existingTiers = new Map(existingBefore.map((s) => [s.config_hash, s.network_type]));
    const existingDeleted = new Set(existingBefore.filter((s) => s.is_deleted).map((s) => s.config_hash));

    await vpnOffGate('Make sure your HOME Wi-Fi is connected.');

    const CONC = Number(process.env.TEST_CONCURRENCY || 50);
    log.step('Phase 1 — Wi-Fi reachability…');
    const working = await deepTest(uris, { conc: CONC, batchSize: 500, phaseLabel: 'Wi-Fi' });
    stats.working = working.length;
    log.ok(`${working.length} / ${stats.total} pass Wi-Fi.`);

    // The Wi-Fi pass (xray-knife -x csv) already reported each server's egress
    // country — fold it into the Gemini map so Phase 2 rarely needs a probe.
    for (const w of working) {
      const k = keyOf(w.uri);
      if (w.exitCc && !meta.get(k)?.exit_cc) meta.set(k, { ...(meta.get(k) || {}), exit_cc: w.exitCc });
    }

    log.step('Phase 2 — Gemini availability…');
    const geminiKeys = await geminiKeysFor(working.map((w) => w.uri), meta);
    stats.gemini = working.filter((w) => geminiKeys.has(keyOf(w.uri))).length;
    log.ok(`${stats.gemini} of the Wi-Fi servers reach Gemini.`);

    vpnOnPrompt();
    log.step('Uploading results to Supabase…');
    // Country/flag comes precomputed from the GitHub scan (candidates.host_cc) —
    // no local ip-api round. Only servers without a precomputed country fall back.
    const geo = new Map();
    const geoGaps = [];
    for (const w of working) {
      const m = meta.get(keyOf(w.uri));
      if (m?.host_cc) geo.set(w.host, { country: m.host_country || null, country_code: m.host_cc });
      else if (w.host) geoGaps.push(w.host);
    }
    if (geoGaps.length) {
      log.info(`Geo: ${geoGaps.length} host(s) not precomputed by GitHub — resolving via ip-api…`);
      const looked = await withVpnRetry(() => lookupCountries(geoGaps), { label: 'geoip-gaps' });
      for (const [h, v] of looked) geo.set(h, v);
    }

    // Quality gate — uses the LOCAL (Russia-measured) latency, NEVER GitHub's US
    // one: drop excluded countries (Russia is pointless here) and servers slower
    // than MAX_LATENCY_MS. Excluded servers fall out of `keep` below, so they are
    // also removed from the live pool. Costs no extra time (data already in hand).
    const eligible = working.filter((w) => {
      const cc = geo.get(w.host)?.country_code;
      if (cc && EXCLUDE_HOST_CC.has(cc)) return false;
      if (w.latencyMs != null && w.latencyMs > MAX_LATENCY_MS) return false;
      return true;
    });
    if (eligible.length !== working.length) {
      log.info(`Quality gate: kept ${eligible.length}/${working.length} (dropped ${working.length - eligible.length} — excl. ${[...EXCLUDE_HOST_CC].join('/') || 'none'} · ping > ${MAX_LATENCY_MS}ms)`);
    }
    stats.eligible = eligible.length;

    const now = new Date().toISOString();
    const sorted = [...eligible].sort((a, b) => {
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
        const country = g.country || 'Server';
        const cc = g.country_code ?? null;
        counters[country] = (counters[country] || 0) + 1;
        const base = `${flagEmoji(cc)} ${country} #${counters[country]}`;
        // dimensional tier: keep LTE dimension from before, set Gemini from this run
        const prev = existingTiers.get(hash);
        const lteDim = prev === 'lte' || prev === 'gemini_lte';
        const gem = geminiKeys.has(keyOf(w.uri));
        const tier = lteDim ? (gem ? 'gemini_lte' : 'lte') : (gem ? 'gemini_wifi' : 'wifi');
        const name = retag(base, tier);
        return {
          name, country: g.country ?? null, country_code: cc, protocol: PROTOCOL_OF(w.uri),
          config_uri: renameConfig(w.uri, name), config_hash: hash, latency_ms: w.latencyMs,
          is_working: true, network_type: tier,
          source_repo: meta.get(keyOf(w.uri))?.source_repo ?? null,
          last_checked_at: now, updated_at: now,
        };
      });
    await withVpnRetry(async () => {
      for (const part of chunk(rows, 500)) {
        const { error } = await supa.from('servers').upsert(part, { onConflict: 'config_hash' });
        if (error) throw new Error(error.message);
      }
    }, { label: 'upsert' });

    // delete servers that no longer pass (not in the working set)
    const keep = new Set(rows.map((r) => r.config_hash));
    const existing = await withVpnRetry(async () => {
      return await fetchAllPaginated('servers', 'id, config_hash, is_deleted');
    }, { label: 'select-stale' });
    const toDelete = existing.filter((s) => !keep.has(s.config_hash) && !s.is_deleted).map((s) => s.id);
    stats.deleted = toDelete.length;
    if (stats.deleted) {
      log.info(`Deleting ${stats.deleted} stale servers…`);
      for (const batch of chunk(toDelete, 100)) {
        await withVpnRetry(async () => {
          const { error } = await supa.from('servers').delete().in('id', batch);
          if (error) throw new Error(error.message);
        }, { label: 'delete' });
      }
    }

    await updateRepoStats();
    stats.finishedAt = new Date().toISOString();
    log.done(`Wi-Fi re-check done — ${eligible.length} live · ${stats.gemini} Gemini · ${stats.deleted} removed · took ${elapsed(stats)}s`);
    return stats;
  } catch (e) {
    log.err(`Wi-Fi re-check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}

// ───────────────────────── LTE button cascade ─────────────────────────────
// Pool = the current Wi-Fi pool → Phase 1 LTE DPI → Phase 2 Gemini. Sets the
// LTE dimension; non-passers are demoted to Wi-Fi-only (Gemini dimension kept).
export async function runLteCascade() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'lte' };
  console.log('');
  log.step('LTE re-check  ·  Phase 1: LTE DPI  →  Phase 2: Gemini');
  try {
    log.info('Loading the Wi-Fi pool (keep VPN ON)…');
    const existing = await withVpnRetry(async () => {
      return await fetchAllPaginated('servers', 'id, config_uri, network_type');
    }, { label: 'select-pool' });
    stats.total = existing.length;
    if (!stats.total) {
      log.warn('No servers in the pool — run the Wi-Fi re-check first.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }

    // Egress country (for the Gemini dimension) from GitHub's candidates.
    const meta = new Map();
    try {
      const data = await fetchAllPaginated('candidates', 'config_uri, exit_cc', { alive: true });
      for (const c of data ?? []) meta.set(keyOf(c.config_uri), { exit_cc: c.exit_cc || null });
    } catch { /* probe will cover unknowns */ }

    await vpnOffGate('Connect to your PHONE hotspot (mobile data), NOT home Wi-Fi.');

    const CONC = Number(process.env.TEST_CONCURRENCY || 50);
    log.step('Phase 1 — LTE reachability…');
    const working = await deepTest(existing.map((s) => s.config_uri), { conc: CONC, batchSize: 500, phaseLabel: 'LTE' });
    const lteKeys = new Set(working.map((w) => keyOf(w.uri)));
    log.ok(`${working.length} / ${stats.total} pass LTE.`);

    // Reuse the egress country xray-knife reported this run for the Gemini split.
    for (const w of working) {
      const k = keyOf(w.uri);
      if (w.exitCc && !meta.get(k)?.exit_cc) meta.set(k, { ...(meta.get(k) || {}), exit_cc: w.exitCc });
    }

    log.step('Phase 2 — Gemini availability…');
    const lteUris = existing.filter((s) => lteKeys.has(keyOf(s.config_uri))).map((s) => s.config_uri);
    const geminiKeys = await geminiKeysFor(lteUris, meta);
    stats.gemini = lteUris.filter((u) => geminiKeys.has(keyOf(u))).length;
    log.ok(`${stats.gemini} of the LTE servers reach Gemini.`);

    vpnOnPrompt();
    log.step('Uploading results to Supabase…');
    const buckets = { gemini_lte: [], lte: [], gemini_wifi: [], wifi: [] };
    for (const s of existing) {
      const k = keyOf(s.config_uri);
      const lteDim = lteKeys.has(k);
      // gemini: this run's result for LTE-passers; preserve existing bit otherwise
      const gemDim = lteDim
        ? geminiKeys.has(k)
        : (s.network_type === 'gemini_wifi' || s.network_type === 'gemini_lte');
      const tier = lteDim ? (gemDim ? 'gemini_lte' : 'lte') : (gemDim ? 'gemini_wifi' : 'wifi');
      buckets[tier].push(s.id);
    }
    const now = new Date().toISOString();
    const classify = async (ids, type) => {
      if (!ids.length) return;
      await withVpnRetry(async () => {
        let cCount = 0;
        for (const idBatch of chunk(ids, 100)) {
          const { data: cur, error: se } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', idBatch);
          if (se) throw new Error(se.message);
          if (!cur || cur.length === 0) continue;
          const updates = cur.map((c) => {
            const nn = retag(c.name, type);
            return { id: c.id, name: nn, config_uri: renameConfig(c.config_uri, nn), config_hash: c.config_hash, network_type: type, last_checked_at: now };
          });
          const { error } = await supa.from('servers').upsert(updates, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          cCount += updates.length;
          log.progress((cCount / ids.length) * 100, `Uploading ${type} (${cCount}/${ids.length})`);
        }
        log.clearProgress();
      }, { label: `classify-${type}` });
    };
    await classify(buckets.gemini_lte, 'gemini_lte');
    await classify(buckets.lte, 'lte');
    await classify(buckets.gemini_wifi, 'gemini_wifi');
    await classify(buckets.wifi, 'wifi');

    await updateRepoStats();
    stats.lte = buckets.lte.length + buckets.gemini_lte.length;
    stats.gemini_lte = buckets.gemini_lte.length;
    stats.finishedAt = new Date().toISOString();
    log.done(`LTE re-check done — ${stats.lte} LTE (${buckets.gemini_lte.length} Gemini) · took ${elapsed(stats)}s`);
    return stats;
  } catch (e) {
    log.err(`LTE re-check failed: ${e.message}`);
    return { error: e.message, ...stats };
  } finally {
    running = false;
  }
}



// ───────────────────────── White-List button cascade ──────────────────────
// Run this WHILE the government's white-list blocking is active on LTE. It
// pulls ALL GitHub-verified candidates (same pool as the Wi-Fi button) and
// tests them over the restricted white-list connection. Servers that pass are
// promoted to the white-list tier. The Gemini dimension is determined by the
// server's egress country (same as Wi-Fi/LTE cascades).
export async function runWhitelistCascade() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'whitelist' };
  console.log('');
  log.step('White-List re-check  ·  testing ALL GitHub candidates under government white-list blocking');
  try {
    log.info('Loading GitHub-verified candidates (keep VPN ON)…');
    const { uris, meta, source } = await withVpnRetry(loadAliveCandidates, { label: 'load-candidates' });
    stats.total = uris.length;
    if (!stats.total) {
      log.warn('No candidates to test — run the GitHub liveness scan first.');
      stats.finishedAt = new Date().toISOString();
      return stats;
    }
    log.ok(`${stats.total} candidate(s) from ${source}.`);

    // Capture existing server tiers before going offline (to preserve non-whitelist tiers).
    const existingBefore = await withVpnRetry(async () => {
      return await fetchAllPaginated('servers', 'config_hash, network_type, is_deleted');
    }, { label: 'select-existing' });
    const existingTiers = new Map(existingBefore.map((s) => [s.config_hash, s.network_type]));
    const existingDeleted = new Set(existingBefore.filter((s) => s.is_deleted).map((s) => s.config_hash));

    await vpnOffGate('Make sure you are on the WHITE-LISTED LTE connection (government white-list mode active).');

    const CONC = Number(process.env.TEST_CONCURRENCY || 50);
    log.step('Phase 1 — White-list reachability…');
    const working = await deepTest(uris, { conc: CONC, batchSize: 500, phaseLabel: 'WhiteList' });
    stats.working = working.length;
    log.ok(`${working.length} / ${stats.total} survive the white-list.`);

    // Fold egress country info from xray-knife results into meta for Gemini split.
    for (const w of working) {
      const k = keyOf(w.uri);
      if (w.exitCc && !meta.get(k)?.exit_cc) meta.set(k, { ...(meta.get(k) || {}), exit_cc: w.exitCc });
    }

    log.step('Phase 2 — Gemini availability…');
    const geminiKeys = await geminiKeysFor(working.map((w) => w.uri), meta);
    stats.gemini = working.filter((w) => geminiKeys.has(keyOf(w.uri))).length;
    log.ok(`${stats.gemini} of the WhiteList servers reach Gemini.`);

    vpnOnPrompt();
    log.step('Uploading results to Supabase…');

    // Country/flag from GitHub's precomputed data.
    const geo = new Map();
    const geoGaps = [];
    for (const w of working) {
      const m = meta.get(keyOf(w.uri));
      if (m?.host_cc) geo.set(w.host, { country: m.host_country || null, country_code: m.host_cc });
      else if (w.host) geoGaps.push(w.host);
    }
    if (geoGaps.length) {
      log.info(`Geo: ${geoGaps.length} host(s) not precomputed by GitHub — resolving via ip-api…`);
      const looked = await withVpnRetry(() => lookupCountries(geoGaps), { label: 'geoip-gaps' });
      for (const [h, v] of looked) geo.set(h, v);
    }

    // Quality gate — drop excluded countries and high-latency servers.
    const eligible = working.filter((w) => {
      const cc = geo.get(w.host)?.country_code;
      if (cc && EXCLUDE_HOST_CC.has(cc)) return false;
      if (w.latencyMs != null && w.latencyMs > MAX_LATENCY_MS) return false;
      return true;
    });
    if (eligible.length !== working.length) {
      log.info(`Quality gate: kept ${eligible.length}/${working.length} (dropped ${working.length - eligible.length} — excl. ${[...EXCLUDE_HOST_CC].join('/') || 'none'} · ping > ${MAX_LATENCY_MS}ms)`);
    }
    stats.eligible = eligible.length;

    const now = new Date().toISOString();
    const sorted = [...eligible].sort((a, b) => {
      const ca = geo.get(a.host)?.country || 'ZZZ';
      const cb = geo.get(b.host)?.country || 'ZZZ';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity);
    });
    const counters = {};
    const wlKeys = new Set(sorted.map((w) => hashConfig(w.uri)));
    const rows = sorted
      .filter((w) => !existingDeleted.has(hashConfig(w.uri)))
      .map((w) => {
        const hash = hashConfig(w.uri);
        const g = geo.get(w.host) || {};
        const country = g.country || 'Server';
        const cc = g.country_code ?? null;
        counters[country] = (counters[country] || 0) + 1;
        const base = `${flagEmoji(cc)} ${country} #${counters[country]}`;
        const gem = geminiKeys.has(keyOf(w.uri));
        const tier = gem ? 'gemini_whitelist' : 'whitelist';
        const name = retag(base, tier);
        return {
          name, country: g.country ?? null, country_code: cc, protocol: PROTOCOL_OF(w.uri),
          config_uri: renameConfig(w.uri, name), config_hash: hash, latency_ms: w.latencyMs,
          is_working: true, network_type: tier,
          source_repo: meta.get(keyOf(w.uri))?.source_repo ?? null,
          last_checked_at: now, updated_at: now,
        };
      });

    // Upsert whitelist servers.
    await withVpnRetry(async () => {
      let cCount = 0;
      for (const part of chunk(rows, 500)) {
        const { error } = await supa.from('servers').upsert(part, { onConflict: 'config_hash' });
        if (error) throw new Error(error.message);
        cCount += part.length;
        log.progress((cCount / rows.length) * 100, `Uploading whitelist (${cCount}/${rows.length})`);
      }
      log.clearProgress();
    }, { label: 'upsert-whitelist' });

    // Demote existing whitelist/gemini_whitelist servers that did NOT survive this run
    // back to lte/gemini_lte (they still work on normal mobile data, just not on whitelist).
    const existingWl = await withVpnRetry(async () => {
      return await fetchAllPaginated('servers', 'id, config_hash, network_type');
    }, { label: 'select-demote' });
    const demotable = existingWl.filter((s) =>
      (s.network_type === 'whitelist' || s.network_type === 'gemini_whitelist') &&
      !wlKeys.has(s.config_hash)
    );
    if (demotable.length) {
      log.info(`Demoting ${demotable.length} previous whitelist servers back to LTE…`);
      const demoteClassify = async (ids, type) => {
        if (!ids.length) return;
        await withVpnRetry(async () => {
          for (const idBatch of chunk(ids, 100)) {
            const { data: cur, error: se } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', idBatch);
            if (se) throw new Error(se.message);
            if (!cur || cur.length === 0) continue;
            const updates = cur.map((c) => {
              const nn = retag(c.name, type);
              return { id: c.id, name: nn, config_uri: renameConfig(c.config_uri, nn), config_hash: c.config_hash, network_type: type, last_checked_at: now };
            });
            const { error } = await supa.from('servers').upsert(updates, { onConflict: 'id' });
            if (error) throw new Error(error.message);
          }
        }, { label: `demote-${type}` });
      };
      const gemDemote = demotable.filter((s) => s.network_type === 'gemini_whitelist').map((s) => s.id);
      const plainDemote = demotable.filter((s) => s.network_type === 'whitelist').map((s) => s.id);
      await demoteClassify(gemDemote, 'gemini_lte');
      await demoteClassify(plainDemote, 'lte');
    }

    await updateRepoStats();
    stats.whitelist = rows.filter((r) => r.network_type === 'whitelist' || r.network_type === 'gemini_whitelist').length;
    stats.gemini_whitelist = rows.filter((r) => r.network_type === 'gemini_whitelist').length;
    stats.demoted = demotable.length;
    stats.finishedAt = new Date().toISOString();
    log.done(`White-list re-check done — ${stats.whitelist} white-listed (${stats.gemini_whitelist} Gemini) · ${stats.demoted} demoted · took ${elapsed(stats)}s`);
    return stats;
  } catch (e) {
    log.err(`White-list re-check failed: ${e.message}`);
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
    // Phase 1: Download pool (Needs VPN)
    log.info('Downloading pool from Supabase (Ensure VPN is ON)…');
    const existing = await withVpnRetry(async () => {
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

    // Phase 2: Wait for user to turn off VPN
    log.bell(`\n╔══════════════════════════════════════════════════════════╗`);
    log.bell(`║  🛑 STOP! TURN OFF YOUR VPN NOW!                        ║`);
    log.bell(`║  We need to test the servers on your REAL connection.   ║`);
    log.bell(`║  Testing will begin automatically in 15 seconds...      ║`);
    log.bell(`╚══════════════════════════════════════════════════════════╝\n`);
    
    // Countdown
    for (let i = 15; i > 0; i--) {
      process.stdout.write(`\r⏳ Starting test in ${i} seconds... `);
      await sleep(1000);
    }
    process.stdout.write('\r\x1b[K'); // clear line
    log.ok('Starting testing now!');

    // Force concurrency to 20 for raw network tests. Do not use TEST_CONCURRENCY from .env
    // because 50 is too high for raw Wi-Fi/LTE adapters and will cause the driver to crash.
    const CONC = 20;
    log.info(`Re-testing ${stats.total} servers over the current network (concurrency ${CONC})…`);
    
    const working = [];
    const BATCH_SIZE = 150; // smaller batch size so progress bar updates frequently
    const candidateBatches = chunk(existing.map(s => s.config_uri), BATCH_SIZE);
    let testedCount = 0;
    log.progress(0, `Xray: 0 passed`);

    for (let i = 0; i < candidateBatches.length; i++) {
      const b = candidateBatches[i];
      const results = await testAll(b, { concurrency: CONC, timeoutMs: 4000 });
      const batchWorking = results.filter((r) => r.ok);
      working.push(...batchWorking);
      testedCount += b.length;
      log.progress((testedCount / stats.total) * 100, `Xray: ${working.length} passed`);
    }
    log.clearProgress();
    
    const workingKeys = new Set(working.map((r) => keyOf(r.uri)));

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
    log.bell(`\n╔══════════════════════════════════════════════════════════╗`);
    log.bell(`║  ✅ TESTING FINISHED!                                   ║`);
    log.bell(`║  Please TURN YOUR VPN BACK ON now!                      ║`);
    log.bell(`║  We need the VPN to upload the results to Supabase.     ║`);
    log.bell(`╚══════════════════════════════════════════════════════════╝\n`);
    log.step('Phase 2 — Uploading results to Supabase…');

    const now = new Date().toISOString();
    const classifyWithRetry = async (ids, type) => {
      if (!ids || ids.length === 0) return;
      await withVpnRetry(async () => {
        let cCount = 0;
        // Chunk the IDs to prevent UND_ERR_HEADERS_OVERFLOW (URL too long for HTTP GET)
        for (const idBatch of chunk(ids, 100)) {
          const { data: current, error: selErr } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', idBatch);
          if (selErr) throw new Error(selErr.message);
          if (!current || current.length === 0) continue;
          
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

          const { error } = await supa.from('servers').upsert(updates, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          
          cCount += updates.length;
          log.progress((cCount / ids.length) * 100, `Uploading ${type} (${cCount}/${ids.length})`);
        }
        log.clearProgress();
      }, { label: `classify-${type}` });
    };
    await classifyWithRetry(geminiLteIds, 'gemini_lte');
    await classifyWithRetry(geminiWifiIds, 'gemini_wifi');
    await classifyWithRetry(lteIds, 'lte');
    await classifyWithRetry(wifiIds, 'wifi');

    await updateRepoStats();

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

// The Gemini result is decided by each server's EXIT IP country, NOT by your
// system VPN — so the geo answer is identical whether your VPN is on or off.
// Default therefore lets you KEEP YOUR VPN ON (so you can stay online / chat
// while it runs). Set GEMINI_RECHECK_VPN_OFF=1 to test on the raw connection
// instead (slightly more reliable: no single VPN chokepoint for the probes).
const GEMINI_VPN_OFF = process.env.GEMINI_RECHECK_VPN_OFF === '1';

async function geminiVpnGate() {
  if (!GEMINI_VPN_OFF) {
    log.info('Gemini re-check: you can keep your VPN ON — the result depends on each');
    log.info('server\'s own exit IP, not your connection. (GEMINI_RECHECK_VPN_OFF=1 to test raw.)');
    return;
  }
  log.bell(`\n╔══════════════════════════════════════════════════════════╗`);
  log.bell(`║  🛑 STOP! TURN OFF YOUR VPN NOW!                        ║`);
  log.bell(`║  Testing on your REAL connection. Starts in 15s…        ║`);
  log.bell(`╚══════════════════════════════════════════════════════════╝\n`);
  for (let i = 15; i > 0; i--) {
    process.stdout.write(`\r⏳ Starting test in ${i} seconds... `);
    await sleep(1000);
  }
  process.stdout.write('\r\x1b[K');
  log.ok('Starting testing now!');
}

// Run the REAL Gemini availability check over a pool of server rows.
//
// Old approach (broken): asked xray-knife to merely *reach* a Google URL — which
// succeeds from every country, so every working server was wrongly tagged
// "Gemini". New approach (worker/src/gemini.js): one fast batched run reports
// each server's REAL egress country (through the tunnel) and classifies by
// Gemini's supported regions; only servers whose country can't be resolved fall
// through to a precise per-config API probe. Fast AND accurate.
//
// Returns a Set of config-keys (renameConfig(uri,'')) that truly reach Gemini.
async function checkGeminiPool(existing, { keyOf }) {
  const uris = existing.map((s) => s.config_uri);
  log.progress(0, `Gemini: starting…`);
  const results = await classifyGeminiPool(uris, {
    onProgress: (pct, label) => log.progress(pct, `Gemini — ${label}`),
  });
  log.clearProgress();
  const okKeys = new Set();
  for (const r of results) if (r && r.ok) okKeys.add(keyOf(r.uri));
  return okKeys;
}

// Gemini / Wi-Fi re-check: tests only the 'wifi' servers to see if they reach Gemini.
export async function runGeminiWifiRecheck() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const stats = { startedAt: new Date().toISOString(), mode: 'gemini_wifi' };
  const keyOf = (u) => renameConfig(u, '');
  console.log('');
  log.step(`Gemini / Wi-Fi re-check — REAL availability probe through each server's tunnel…`);
  try {
    // Phase 1: Download pool (Needs VPN)
    log.info('Downloading pool from Supabase (Ensure VPN is ON)…');
    const existing = await withVpnRetry(async () => {
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

    await geminiVpnGate();

    const okKeys = await checkGeminiPool(existing, { keyOf });

    const geminiIds = [];
    const wifiIds = [];
    for (const s of existing) {
      if (okKeys.has(keyOf(s.config_uri))) geminiIds.push(s.id);
      else wifiIds.push(s.id);
    }
    stats.gemini = geminiIds.length;
    log.ok(`${stats.gemini} reach Gemini over Wi-Fi  ·  ${wifiIds.length} are Wi-Fi only`);

    // ──────── PHASE 2: Upload results to Supabase ────────
    if (GEMINI_VPN_OFF) {
      log.bell(`\n╔══════════════════════════════════════════════════════════╗`);
      log.bell(`║  ✅ TESTING FINISHED!                                   ║`);
      log.bell(`║  Please TURN YOUR VPN BACK ON now!                      ║`);
      log.bell(`║  We need the VPN to upload the results to Supabase.     ║`);
      log.bell(`╚══════════════════════════════════════════════════════════╝\n`);
    }
    log.step('Phase 2 — Uploading results to Supabase…');

    const now = new Date().toISOString();
    const classify = async (ids, type) => {
      if (!ids || ids.length === 0) return;
      await withVpnRetry(async () => {
        let cCount = 0;
        for (const idBatch of chunk(ids, 100)) {
          const { data: current, error: selErr } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', idBatch);
          if (selErr) throw new Error(selErr.message);
          if (!current || current.length === 0) continue;
          
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
          
          const { error } = await supa.from('servers').upsert(updates, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          
          cCount += updates.length;
          log.progress((cCount / ids.length) * 100, `Uploading ${type} (${cCount}/${ids.length})`);
        }
        log.clearProgress();
      }, { label: `classify-${type}` });
    };
    await classify(geminiIds, 'gemini_wifi');
    await classify(wifiIds, 'wifi');

    await updateRepoStats();

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
  log.step(`Gemini / LTE / Wi-Fi re-check — REAL availability probe through each server's tunnel…`);
  try {
    // Phase 1: Download pool (Needs VPN)
    log.info('Downloading pool from Supabase (Ensure VPN is ON)…');
    const existing = await withVpnRetry(async () => {
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

    await geminiVpnGate();

    const okKeys = await checkGeminiPool(existing, { keyOf });

    const geminiIds = [];
    const lteIds = [];
    for (const s of existing) {
      if (okKeys.has(keyOf(s.config_uri))) geminiIds.push(s.id);
      else lteIds.push(s.id);
    }
    stats.gemini = geminiIds.length;
    log.ok(`${stats.gemini} reach Gemini over LTE  ·  ${lteIds.length} are LTE only`);

    // ──────── PHASE 2: Upload results to Supabase ────────
    if (GEMINI_VPN_OFF) {
      log.bell(`\n╔══════════════════════════════════════════════════════════╗`);
      log.bell(`║  ✅ TESTING FINISHED!                                   ║`);
      log.bell(`║  Please TURN YOUR VPN BACK ON now!                      ║`);
      log.bell(`║  We need the VPN to upload the results to Supabase.     ║`);
      log.bell(`╚══════════════════════════════════════════════════════════╝\n`);
    }
    log.step('Phase 2 — Uploading results to Supabase…');

    const now = new Date().toISOString();
    const classifyWithRetry = async (ids, type) => {
      if (!ids || ids.length === 0) return;
      await withVpnRetry(async () => {
        let cCount = 0;
        for (const idBatch of chunk(ids, 100)) {
          const { data: current, error: selErr } = await supa.from('servers').select('id, name, config_uri, config_hash').in('id', idBatch);
          if (selErr) throw new Error(selErr.message);
          if (!current || current.length === 0) continue;
          
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
          
          const { error } = await supa.from('servers').upsert(updates, { onConflict: 'id' });
          if (error) throw new Error(error.message);
          
          cCount += updates.length;
          log.progress((cCount / ids.length) * 100, `Uploading ${type} (${cCount}/${ids.length})`);
        }
        log.clearProgress();
      }, { label: `classify-${type}` });
    };
    await classifyWithRetry(geminiIds, 'gemini_lte');
    await classifyWithRetry(lteIds, 'lte');

    await updateRepoStats();

    stats.finishedAt = new Date().toISOString();
    log.done(`Gemini / LTE / Wi-Fi re-check done — ${stats.gemini} Gemini / LTE / Wi-Fi · took ${Math.round((Date.parse(stats.finishedAt) - Date.parse(stats.startedAt)) / 1000)}s`);
    return stats;
  } catch (e) {
    log.err(`Gemini / LTE / Wi-Fi re-check failed: ${e.message}`);
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

// Recalculates repo_stats based on the live database server states
export async function updateRepoStats() {
  log.info('Recomputing per-repo statistics…');
  try {
    const liveServers = await fetchAllPaginated('servers', 'source_repo, network_type', { is_working: true, is_deleted: false });

    const liveByRepo = new Map();
    for (const s of liveServers ?? []) {
      const repo = s.source_repo;
      if (!repo) continue;
      if (!liveByRepo.has(repo)) liveByRepo.set(repo, { working: 0, wifi: 0, lte: 0, gemini_wifi: 0, gemini_lte: 0 });
      const r = liveByRepo.get(repo);
      r.working++;
      if (s.network_type === 'wifi') r.wifi++;
      else if (s.network_type === 'lte') r.lte++;
      else if (s.network_type === 'gemini_wifi') r.gemini_wifi++;
      else if (s.network_type === 'gemini_lte') r.gemini_lte++;
    }

    const { data: existingStats } = await supa.from('repo_stats').select('*');
    const syncTime = new Date().toISOString();
    const statRows = [];
    
    for (const st of existingStats ?? []) {
      const live = liveByRepo.get(st.repo_url) || { working: 0, wifi: 0, lte: 0, gemini_wifi: 0, gemini_lte: 0 };
      statRows.push({
        ...st,
        configs_working: live.working,
        wifi_count: live.wifi,
        lte_count: live.lte,
        gemini_count: live.gemini_wifi + live.gemini_lte,
        gemini_wifi_count: live.gemini_wifi,
        gemini_lte_count: live.gemini_lte,
        updated_at: syncTime,
      });
    }

    if (statRows.length > 0) {
      await withRetry(async () => {
        const { error } = await supa.from('repo_stats').upsert(statRows, { onConflict: 'repo_url' });
        if (error) throw new Error(error.message);
      }, { label: 'upsert-repo-stats' });
      log.ok(`Updated stats for ${statRows.length} repos`);
    }
  } catch (e) {
    log.warn(`repo_stats update failed (non-fatal): ${e.message}`);
  }
}
