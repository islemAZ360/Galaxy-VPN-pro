import fs from 'node:fs';
import { supa, closeSupa } from './supa.js';
import { fetchRepoTexts } from './github.js';
import { extractConfigs, hashConfig } from './parse.js';
import { log } from './log.js';

(async () => {
  log.step('Calculating dynamic matrix for GitHub Actions...');

  const { data: repos, error: repoErr } = await supa.from('repos').select('repo_url').eq('enabled', true);
  if (repoErr) {
    log.err(`repos query failed: ${repoErr.message}`);
    await closeSupa();
    process.exit(1);
  }

  log.info(`Reading ${repos?.length ?? 0} enabled repo(s)...`);

  const configs = new Set();
  const REPO_CHUNK_SIZE = 4;
  const reposArray = repos ?? [];
  
  for (let i = 0; i < reposArray.length; i += REPO_CHUNK_SIZE) {
    const batch = reposArray.slice(i, i + REPO_CHUNK_SIZE);
    await Promise.all(batch.map(async (r) => {
      try {
        const { text, fileCount } = await fetchRepoTexts(r.repo_url);
        const found = extractConfigs(text);
        for (const uri of found) configs.add(hashConfig(uri));
        log.info(`  · ${r.repo_url}  →  ${fileCount} files  →  ${found.length} configs`);
      } catch (e) {
        log.err(`repo ${r.repo_url}: ${e.message}`);
      }
    }));
  }

  let totalConfigs = configs.size;
  log.ok(`Discovered ${totalConfigs} unique configs across all repos.`);

  if (totalConfigs === 0) {
    totalConfigs = 1; // Prevent math errors
  }

  // Calculate target chunks (aiming for ~4000 configs per runner)
  const CHUNKS_PER_RUNNER = 4000;
  let targetChunks = Math.ceil(totalConfigs / CHUNKS_PER_RUNNER);
  
  if (targetChunks < 1) targetChunks = 1;
  if (targetChunks > 20) targetChunks = 20; // Max allowed by GitHub Free tier for concurrent jobs
  
  log.info(`Calculated Target Chunks: ${targetChunks} (up to 20 limit)`);

  const matrixArray = Array.from({ length: targetChunks }, (_, i) => i);
  
  // Write to GITHUB_OUTPUT
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrixArray)}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `total=${targetChunks}\n`);
    log.ok(`Successfully wrote matrix to GITHUB_OUTPUT: ${JSON.stringify(matrixArray)}`);
  } else {
    log.warn('GITHUB_OUTPUT not defined. Outputting to console for testing:');
    console.log(`matrix=${JSON.stringify(matrixArray)}`);
    console.log(`total=${targetChunks}`);
  }

  await closeSupa();
})();
