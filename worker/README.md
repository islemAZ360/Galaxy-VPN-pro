# GalaxyVPN Tester Worker

Background service that keeps the `servers` table in Supabase in sync with the
live, working server pool.

## What it does (each run)
1. Reads enabled rows from `repos` (managed by the admin in the modified Hiddify app).
2. For each repo, discovers all `.txt` files via the GitHub API and fetches their raw content (`github.js`).
3. Extracts `vless/vmess/trojan/ss/...` config URIs, de-duplicated by SHA-256 hash (`parse.js`).
4. Tests every config (`test.js` — TCP reachability + latency; upgradeable to xray-knife).
5. Looks up each working server's country/flag via ip-api (`geoip.js`).
6. **Upserts** working servers and **deletes** dead ones from `servers` (`sync.js`).

## Run
```bash
npm install
cp .env.example .env      # fill SUPABASE_SERVICE_ROLE_KEY + WORKER_TRIGGER_SECRET
npm run sync              # one-shot test run
npm start                 # long-running: cron + POST /trigger-sync endpoint
```

## Endpoints
- `GET  /health` → `{ ok, running }`
- `POST /trigger-sync` (header `x-worker-secret: <WORKER_TRIGGER_SECRET>`) → starts a sync now.
  Called by the "Check / فحص" button in Hiddify and the admin dashboard.

## Deploy (Render)
Background Worker, Docker. Set env vars from `.env.example`. The `SYNC_CRON`
default runs every 20 minutes; the initial sync runs on boot.

## Note on testing depth
The current tester does a TCP connect (reachability + latency), which works with
zero external dependencies. For full protocol validation, uncomment the xray-knife
install in the `Dockerfile` and extend `src/test.js` to shell out to it.
