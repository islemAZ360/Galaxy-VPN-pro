import { fetchRepoTexts } from './worker/src/github.js';
import { extractConfigs } from './worker/src/parse.js';

async function analyze() {
  const repoUrl = 'https://github.com/VAL41K/bypass-rkn-blocks.git';
  try {
    console.log(`Fetching from: ${repoUrl}`);
    const { fileCount, text } = await fetchRepoTexts(repoUrl);
    console.log(`  -> Found ${fileCount} .txt files`);
    
    const configs = extractConfigs(text);
    console.log(`  -> Extracted ${configs.length} configs from this repo`);
  } catch (e) {
    console.error(`Error fetching ${repoUrl}:`, e);
  }
}

analyze();
