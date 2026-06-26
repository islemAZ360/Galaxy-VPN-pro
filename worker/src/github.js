// Discover and fetch server-link .txt files from GitHub repos.
const GH_API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

function ghHeaders() {
  const h = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'galaxyvpn-worker' };
  if (process.env.GITHUB_TOKEN) h['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

// "https://github.com/owner/repo(.git)" -> { owner, repo }
export function parseRepoUrl(url) {
  const m = String(url).trim().match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function getDefaultBranch(owner, repo) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`repo meta ${owner}/${repo}: ${res.status}`);
  const j = await res.json();
  return j.default_branch || 'main';
}

// Recursively list all .txt file paths in the repo tree.
async function listTxtFiles(owner, repo, branch) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: ghHeaders(),
  });
  if (!res.ok) throw new Error(`tree ${owner}/${repo}@${branch}: ${res.status}`);
  const j = await res.json();
  return (j.tree || [])
    .filter((n) => {
      if (n.type !== 'blob') return false;
      // Accept .txt, .md, or files with no extension (e.g. config files)
      if (/\.(txt|md)$/i.test(n.path)) return true;
      if (!n.path.includes('.')) return true; // no extension
      return false;
    })
    .map((n) => n.path);
}

async function fetchRaw(owner, repo, branch, path) {
  const url = `${RAW}/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'galaxyvpn-worker' } });
  if (!res.ok) return '';
  return await res.text();
}

// Returns concatenated text of all .txt files found in the repo.
export async function fetchRepoTexts(repoUrl) {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new Error(`bad repo url: ${repoUrl}`);
  const { owner, repo } = parsed;
  const branch = await getDefaultBranch(owner, repo);
  const files = await listTxtFiles(owner, repo, branch);
  const texts = [];
  
  // Process files concurrently in chunks to speed up without hitting rate limits
  const CHUNK_SIZE = 20;
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const batch = files.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      batch.map(path => fetchRaw(owner, repo, branch, path))
    );
    for (const txt of results) {
      if (txt) texts.push(txt);
    }
  }
  
  return { repoUrl, fileCount: files.length, text: texts.join('\n') };
}
