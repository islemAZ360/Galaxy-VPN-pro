# GalaxyVPN Tester Worker

Keeps the `servers` table in Supabase in sync with the **live, working** server
pool — tested with a **real protocol check**, from **inside Russia**.

> ⚠️ **Run this from Russia.** The whole point is to keep only servers that work
> for Russian users. Testing from elsewhere (a US/EU cloud, GitHub Actions, …)
> measures the wrong network and lets through servers that Russia's DPI blocks.
> Run it on your own machine in Russia (or a Russian VPS).

## What it does (each run)
1. Reads enabled rows from `repos` (managed by the admin in the **website admin panel** → Repos).
2. For each repo, discovers all `.txt` files via the GitHub API and fetches their raw content (`github.js`).
3. Extracts `vless/vmess/trojan/ss/...` config URIs, de-duplicated by SHA-256 hash (`parse.js`).
4. **Really tests** each config with **xray-knife** (actual connection + URL test, xray-core/sing-box) — `test.js`. Falls back to a TCP check if the binary is missing.
5. Looks up each working server's country/flag via ip-api (`geoip.js`).
6. **Upserts** working servers and **deletes** dead ones from `servers` (`sync.js`).

## Setup
```bash
npm install
cp .env.example .env      # fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```
Download **xray-knife** for your OS and point `.env` at it:
- Releases: https://github.com/lilendian0x00/xray-knife/releases
- `.env` → `XRAY_KNIFE_PATH=C:\tools\xray-knife.exe` (full path on Windows)

## Run (from Russia)
```bash
npm run sync     # one-shot: discover → real-test → sync to Supabase
```
Schedule it to repeat (recommended every 20–30 min):
- **Windows**: Task Scheduler → run `npm run sync` in this folder on a trigger.
- **Linux/VPS**: a cron entry, or `npm start` (keeps an internal cron + a
  `POST /trigger-sync` endpoint guarded by `WORKER_TRIGGER_SECRET`).

## Verify the test engine
```bash
xray-knife http --help        # confirm flags
xray-knife http -f some.txt   # try it on a few configs
```
If `XRAY_KNIFE_PATH` is unset/not found, the worker logs a warning and falls back
to a weaker TCP-reachability check so the pipeline still runs.
