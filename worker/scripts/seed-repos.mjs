// Seed / verify connectivity: inserts example repo(s) into `repos` and reads back.
// Run: node --env-file-if-exists=.env scripts/seed-repos.mjs
import { supa } from '../src/supa.js';

const REPOS = [
  'https://github.com/hiztin/VLESS-PO-GRIBI.git',
];

const rows = REPOS.map((repo_url) => ({ repo_url, enabled: true }));
const { error } = await supa.from('repos').upsert(rows, { onConflict: 'repo_url' });
if (error) { console.error('upsert failed:', error.message); process.exit(1); }

const { data, error: selErr } = await supa.from('repos').select('id, repo_url, enabled');
if (selErr) { console.error('select failed:', selErr.message); process.exit(1); }
console.log('repos in DB:', JSON.stringify(data, null, 2));
process.exit(0);
