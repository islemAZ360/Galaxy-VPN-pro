// ===========================================================================
// GitHub liveness scan — runs on a GitHub Action (NOT in Russia).
//
// Discovers every config from the enabled repos, runs a real xray-knife
// protocol test + egress-country lookup, and writes the result to the
// `candidates` table in Supabase. The LOCAL worker then skips configs this scan
// confirmed DEAD, so the Russia machine only deep-tests known/likely-alive
// servers.
//
// What this can/can't tell us:
//   • DEAD here (host down / handshake fails)  → almost certainly dead everywhere.
//   • ALIVE here                               → reachable from a permissive net;
//                                                Russia may still block it (the
//                                                local DPI test decides that).
// Russia-only-hosted servers could look dead here, so any config whose HOST is
// in a kept country (RU/BY by default) is force-marked alive → always tested
// locally. Nothing here ever touches the `servers` pool.
// ===========================================================================
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { supa, closeSupa } from './supa.js';
import { fetchRepoTexts } from './github.js';
import { extractConfigs, hashConfig, PROTOCOL_OF } from './parse.js';
import { lookupCountries } from './geoip.js';
import { parseConfig } from './uri.js';
import { log } from './log.js';

const XK_PATH = process.env.XRAY_KNIFE_PATH || 'xray-knife';
const XK_CORE = process.env.XRAY_KNIFE_CORE || 'auto';
const URL_TEST = process.env.LIVENESS_URL || 'https://cloudflare.com/cdn-cgi/trace';
const THREADS = Number(process.env.LIVENESS_THREADS || 100);
const MDELAY = Number(process.env.LIVENESS_MDELAY_MS || 8000);
const CHUNK = Number(process.env.LIVENESS_CHUNK || 1500);
const STALE_HOURS = Number(process.env.LIVENESS_STALE_HOURS || 6);
// Host countries kept (force-alive) even if unreachable from the runner — they
// may be Russia-only and must still be deep-tested locally.
const KEEP_HOST_CC = new Set(
  (process.env.LIVENESS_KEEP_HOST_CC || 'RU,BY')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
);

const chunk = (a, n) => {
  const o = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// columns: link,status,reason,tls,ip,delay,code,download,upload,location,ttfb,connect_time
function runBatch(uris) {
  return new Promise(async (resolve) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gv-live-'));
    const inFile = path.join(dir, 'in.txt');
    const outFile = path.join(dir, 'out.csv');
    const map = new Map();
    try {
      await writeFile(inFile, uris.join('\n'), 'utf8');
      await new Promise((done) => {
        execFile(
          XK_PATH,
          ['http', '-f', inFile, '-u', URL_TEST, '-x', 'csv', '-o', outFile,
            '-t', String(THREADS), '-d', String(MDELAY), '-z', XK_CORE],
          { timeout: 30 * 60 * 1000, maxBuffer: 256 * 1024 * 1024 },
          (err) => { if (err && err.code === 'ENOENT') map.set('__enoent__', true); done(); }
        );
      });
      const text = await readFile(outFile, 'utf8').catch(() => '');
      const lines = text.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const c = parseCsvLine(lines[i]);
        if (c.length < 11) continue;
        const link = c[0];
        const status = c[1];
        const loc = c[9];
        map.set(hashConfig(link), {
          alive: status === 'passed' || status === 'semi-passed',
          exit_cc: loc && loc !== 'null' ? loc.toUpperCase() : null,
        });
      }
    } catch (e) {
      log.warn(`liveness batch failed: ${e.message}`);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    resolve(map);
  });
}

// Host geolocation rarely changes, so reuse what prior runs already resolved
// (cached in candidates.host_cc) instead of re-querying ip-api every scan. Returns
// host -> { country, country_code }. Empty if the columns don't exist yet.
async function loadKnownHostGeo() {
  const cache = new Map();
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supa
      .from('candidates')
      .select('config_uri, host_cc, host_country')
      .not('host_cc', 'is', null)
      .range(from, from + size - 1);
    if (error) {
      if (/host_cc|host_country|column/i.test(error.message)) return cache; // not migrated yet
      log.warn(`host-geo cache read failed: ${error.message}`);
      return cache;
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const h = parseConfig(r.config_uri).host;
      if (h && !cache.has(h)) cache.set(h, { country: r.host_country || null, country_code: r.host_cc });
    }
    if (data.length < size) break;
    from += size;
  }
  return cache;
}

(async () => {
  log.step('GitHub liveness scan — testing the whole pool from a permissive network…');

  // 1. enabled repos → unique configs
  const { data: repos, error: repoErr } = await supa.from('repos').select('repo_url').eq('enabled', true);
  if (repoErr) { log.err(`repos query failed: ${repoErr.message}`); await closeSupa(); process.exit(1); }
  log.info(`Reading ${repos?.length ?? 0} enabled repo(s)…`);

  const configs = new Map(); // hash -> { uri, source }
  const perRepo = new Map();  // repo_url -> { files_found, configs_extracted }
  for (const r of repos ?? []) {
    try {
      const { text, fileCount } = await fetchRepoTexts(r.repo_url);
      let found = extractConfigs(text);
      
      const MAX_CONFIGS_PER_REPO = 15000;
      if (found.length > MAX_CONFIGS_PER_REPO) {
        log.warn(`  ! ${r.repo_url} yielded ${found.length} configs. Smart sampling down to ${MAX_CONFIGS_PER_REPO}…`);
        const half = Math.floor(MAX_CONFIGS_PER_REPO / 2);
        found = [...found.slice(0, half), ...found.slice(-half)];
      }

      perRepo.set(r.repo_url, { files_found: fileCount, configs_extracted: found.length });
      log.info(`  · ${r.repo_url}  →  ${fileCount} files  →  ${found.length} configs`);
      for (const uri of found) configs.set(hashConfig(uri), { uri, source: r.repo_url });
    } catch (e) {
      log.err(`repo ${r.repo_url}: ${e.message}`);
    }
  }
  log.ok(`Discovered ${configs.size} unique configs`);
  if (configs.size === 0) { log.warn('0 configs — leaving candidates untouched.'); await closeSupa(); process.exit(0); }

  // 2. batched liveness + egress country
  const uris = [...configs.values()].map((c) => c.uri);
  const live = new Map();
  let enoent = false;
  const batches = chunk(uris, CHUNK);
  let done = 0;
  for (const b of batches) {
    const m = await runBatch(b);
    if (m.get('__enoent__')) enoent = true;
    for (const [k, v] of m) if (k !== '__enoent__') live.set(k, v);
    done += b.length;
    log.info(`liveness ${done}/${uris.length} tested`);
  }
  if (enoent) { log.err(`xray-knife not found at "${XK_PATH}".`); await closeSupa(); process.exit(1); }
  const aliveCount = [...live.values()].filter((v) => v.alive).length;
  log.ok(`${aliveCount}/${uris.length} alive from the runner`);

  // 3. Host country (network-independent — same answer anywhere). Reuse what prior
  //    runs already resolved (candidates.host_cc) and ip-api ONLY the new/unknown
  //    hosts — this stays inside ip-api's rate limit and converges to ~100%
  //    coverage over a few runs. Stored so the LOCAL run never calls ip-api itself.
  const allHosts = new Set();
  for (const [, c] of configs) { const h = parseConfig(c.uri).host; if (h) allHosts.add(h); }

  const hostGeo = await loadKnownHostGeo(); // host -> { country, country_code }
  const unknownHosts = [...allHosts].filter((h) => !hostGeo.has(h));
  log.info(`Host geo: ${allHosts.size - unknownHosts.length} cached · ${unknownHosts.length} new to resolve`);
  if (unknownHosts.length) {
    try {
      const fresh = await lookupCountries(unknownHosts);
      // Only cache successful resolutions; unresolved hosts retry next run.
      for (const [h, v] of fresh) if (v && v.country_code) hostGeo.set(h, v);
    } catch (e) {
      log.warn(`host geoip failed (${e.message}) — uncovered hosts resolved locally this run.`);
    }
  }

  // 4. build + upsert rows
  const nowIso = new Date().toISOString();
  const rows = [];
  let forced = 0;
  for (const [hash, c] of configs) {
    const l = live.get(hash);
    const host = parseConfig(c.uri).host;
    const hg = host ? hostGeo.get(host) : null;
    const hostCC = hg?.country_code ?? null;
    const hostCountry = hg?.country ?? null;
    const keep = hostCC && KEEP_HOST_CC.has(hostCC) && !(l && l.alive);
    if (keep) forced++;
    rows.push({
      config_hash: hash,
      config_uri: c.uri,
      source_repo: c.source,
      protocol: PROTOCOL_OF(c.uri),
      exit_cc: l?.exit_cc ?? null,
      host_cc: hostCC,
      host_country: hostCountry,
      alive: !!(l && l.alive) || !!keep,
      scanned_at: nowIso,
    });
  }
  for (const part of chunk(rows, 500)) {
    let { error } = await supa.from('candidates').upsert(part, { onConflict: 'config_hash' });
    if (error && /host_cc|host_country|column/i.test(error.message)) {
      // host_cc/host_country not migrated yet — retry without them so the scan still works
      const stripped = part.map(({ host_cc, host_country, ...r }) => r);
      ({ error } = await supa.from('candidates').upsert(stripped, { onConflict: 'config_hash' }));
    }
    if (error) log.err(`upsert: ${error.message}`);
  }
  const aliveRows = rows.filter((r) => r.alive).length;
  log.ok(`Upserted ${rows.length} candidates — ${aliveRows} alive (incl. ${forced} Russia-hosted protected), ${rows.length - aliveRows} dead.`);

  // 4b. repo_stats: write files_found + configs_extracted for EVERY enabled repo
  //     (so a newly-added repo stops showing "Not synced yet"). The local cascade
  //     fills the working/network counters — preserve them here so we don't zero
  //     them between local runs.
  try {
    const { data: existingStats } = await supa.from('repo_stats').select('*');
    const prevByUrl = new Map((existingStats ?? []).map((s) => [s.repo_url, s]));
    const statRows = [];
    for (const r of repos ?? []) {
      const p = perRepo.get(r.repo_url);
      if (!p) continue; // repo failed to fetch this run — leave its row untouched
      const prev = prevByUrl.get(r.repo_url) || {};
      statRows.push({
        repo_url: r.repo_url,
        files_found: p.files_found,
        configs_extracted: p.configs_extracted,
        configs_working: prev.configs_working ?? 0,
        wifi_count: prev.wifi_count ?? 0,
        lte_count: prev.lte_count ?? 0,
        gemini_count: prev.gemini_count ?? 0,
        gemini_wifi_count: prev.gemini_wifi_count ?? 0,
        gemini_lte_count: prev.gemini_lte_count ?? 0,
        last_sync_at: prev.last_sync_at ?? null,
        updated_at: nowIso,
      });
    }
    if (statRows.length) {
      let { error } = await supa.from('repo_stats').upsert(statRows, { onConflict: 'repo_url' });
      if (error) {
        // An un-migrated table may lack some columns (gemini_wifi_count, etc.),
        // which fails the whole batch. Retry with ONLY the columns the admin page
        // reads — guaranteed to exist — so a new repo still gets its row.
        log.warn(`repo_stats full upsert failed (${error.message}) — retrying with the minimal column set…`);
        const minimal = statRows.map((s) => ({
          repo_url: s.repo_url,
          files_found: s.files_found,
          configs_extracted: s.configs_extracted,
          configs_working: s.configs_working,
          wifi_count: s.wifi_count,
          lte_count: s.lte_count,
          gemini_count: s.gemini_count,
          last_sync_at: s.last_sync_at,
        }));
        ({ error } = await supa.from('repo_stats').upsert(minimal, { onConflict: 'repo_url' }));
      }
      if (error) log.err(`repo_stats upsert failed: ${error.message} — run supabase/repo_stats.sql once.`);
      else log.ok(`repo_stats updated for ${statRows.length} repo(s).`);
    }
  } catch (e) {
    log.warn(`repo_stats step failed (non-fatal): ${e.message}`);
  }

  // 5. prune configs that vanished from the repos (not re-scanned this run)
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString();
  const { error: delErr } = await supa.from('candidates').delete().lt('scanned_at', cutoff);
  if (delErr) log.err(`prune: ${delErr.message}`);
  else log.info(`Pruned candidates not seen in ${STALE_HOURS}h.`);

  log.done('Liveness scan complete.');
  await closeSupa();
  process.exit(0);
})();
