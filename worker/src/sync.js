import { supa } from './supa.js';
import { fetchRepoTexts } from './github.js';
import { extractConfigs, hashConfig, PROTOCOL_OF } from './parse.js';
import { testAll } from './test.js';
import { lookupCountries } from './geoip.js';

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

export async function runSync() {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  const log = { startedAt: new Date().toISOString() };
  try {
    // 1. enabled repos
    const { data: repos, error: repoErr } = await supa.from('repos').select('repo_url').eq('enabled', true);
    if (repoErr) throw repoErr;
    log.repos = repos?.length ?? 0;

    // 2. gather unique configs across all repos (hash -> { uri, source })
    const configs = new Map();
    for (const r of repos ?? []) {
      try {
        const { text } = await fetchRepoTexts(r.repo_url);
        for (const uri of extractConfigs(text)) {
          configs.set(hashConfig(uri), { uri, source: r.repo_url });
        }
      } catch (e) {
        console.error(`[sync] repo failed ${r.repo_url}:`, e.message);
      }
    }
    log.discovered = configs.size;

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
    log.candidates = candidates.length;
    const CONC = Number(process.env.TEST_CONCURRENCY || 40);
    const results = await testAll(candidates, { concurrency: CONC, timeoutMs: 4000 });
    const working = results.filter((r) => r.ok);
    log.working = working.length;

    // let lingering sockets drain before HTTP fetch calls (Windows TIME_WAIT)
    await sleep(Number(process.env.DRAIN_MS || 2000));

    // 4. geoip for working hosts
    const geo = await lookupCountries(working.map((w) => w.host));

    // 5. build rows + upsert
    const rows = working.map((w) => {
      const g = geo.get(w.host) || {};
      return {
        name: w.name || w.host,
        country: g.country ?? null,
        country_code: g.country_code ?? null,
        protocol: PROTOCOL_OF(w.uri),
        config_uri: w.uri,
        config_hash: hashConfig(w.uri),
        latency_ms: w.latencyMs,
        is_working: true,
        source_repo: configs.get(hashConfig(w.uri))?.source ?? null,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });
    // upsert in chunks (resilient to transient network errors)
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
    log.deleted = toDelete.length;
    for (const batch of chunk(toDelete, 100)) {
      await withRetry(async () => {
        const { error } = await supa.from('servers').delete().in('id', batch);
        if (error) throw new Error(error.message);
      }, { label: 'delete' });
    }

    log.finishedAt = new Date().toISOString();
    console.log('[sync] done', log);
    return log;
  } catch (e) {
    console.error('[sync] error', e);
    return { error: e.message, ...log };
  } finally {
    running = false;
  }
}
