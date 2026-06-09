import express from 'express';
import cron from 'node-cron';
import { runSync, isRunning } from './sync.js';
import { supa } from './supa.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 8080;
const SECRET = process.env.WORKER_TRIGGER_SECRET || '';
const CRON = process.env.SYNC_CRON || '*/20 * * * *'; // every 20 minutes

// All /api and /trigger-sync routes require the shared secret header.
function requireSecret(req, res, next) {
  if (!SECRET || req.get('x-worker-secret') !== SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true, running: isRunning() }));

// ---- Repo management (used by the modified Hiddify admin app) ----
app.get('/api/repos', requireSecret, async (_req, res) => {
  const { data, error } = await supa.from('repos').select('id, repo_url, enabled, created_at').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/repos', requireSecret, async (req, res) => {
  const repo_url = (req.body?.repo_url || '').trim();
  if (!repo_url) return res.status(400).json({ error: 'repo_url required' });
  const { data, error } = await supa.from('repos').upsert({ repo_url, enabled: true }, { onConflict: 'repo_url' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/repos/:id', requireSecret, async (req, res) => {
  const { error } = await supa.from('repos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

// ---- Live server pool (read-only view for the Hiddify admin app) ----
app.get('/api/servers', requireSecret, async (_req, res) => {
  const { data, error } = await supa
    .from('servers')
    .select('id, name, country, country_code, protocol, latency_ms, last_checked_at')
    .order('latency_ms', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Trigger a sync now (Hiddify "Check / فحص" button + admin dashboard) ----
app.post('/trigger-sync', requireSecret, async (_req, res) => {
  if (isRunning()) return res.status(202).json({ status: 'already running' });
  runSync(); // fire-and-forget; clients poll /health or read servers
  res.status(202).json({ status: 'started' });
});

cron.schedule(CRON, () => {
  console.log('[cron] scheduled sync tick');
  runSync();
});

app.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}, cron "${CRON}"`);
  runSync(); // initial run on boot
});
