# AI Developer Manual & Architecture Guide: GalaxyVPN Pro

**Welcome, AI Assistant.**
This is the source of truth for the `GalaxyVPN Pro` project. Read it before
proposing architectural changes, debugging, or adding features. It documents the
real logic, database schema, network-testing flow, and design/motion system as
they exist in the code today. Where this file once disagreed with the code, the
code won — see the changelog at the bottom.

---

## 1. Project Philosophy & Core Purpose
**GalaxyVPN Pro** distributes a highly-curated, continuously-tested pool of
V2Ray/VLESS/Trojan/Reality proxy configs that survive sophisticated censorship
(Russia, Iran, China). It has two halves:
1. **The Tester Worker (`/worker`):** a local Node.js process that scrapes
   GitHub, parses proxy URIs, runs **real** connection tests with the
   `xray-knife` CLI **from inside Russia**, and syncs only the survivors to
   Supabase.
2. **The Web App (`/src`):** a Next.js 15 App Router site that authenticates
   users (Google OAuth), lets the admin drive the worker, sells time-based
   subscriptions, and hands working configs to users.

> The worker MUST run from the target network (Russia). Testing elsewhere
> measures the wrong path and lets DPI-blocked servers through.

---

## 2. Tech Stack
- **Framework:** Next.js 15 (App Router, React 19 — Server + Client Components).
- **Styling:** Tailwind CSS v3 (dark, glassmorphic). Custom tokens in
  `tailwind.config.ts` + `globals.css`.
- **Motion:** `framer-motion` (scroll reveals, menus, toasts) and `three.js`
  (the hero shader). A shared CSS motion layer in `globals.css`.
- **i18n:** `next-intl`. `src/middleware.ts` handles `/[locale]` routing.
  Strings live in `messages/en.json` and `messages/ar.json` (Arabic = RTL).
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, RLS).
- **Worker runtime:** Node.js **>= 20** (ESM). Uses `child_process.execFile`,
  `node-cron`, global `fetch`, and an `undici` `Agent` dispatcher.

---

## 3. Database Schema (Supabase)
Columns below reflect what the code actually reads/writes.

- **`servers`** — the live, tested pool.
  `id` (uuid), `name`, `country`, `country_code`, `protocol`, `config_uri`,
  `config_hash` (sha256 of the original URI = stable identity), `latency_ms`,
  `is_working` (bool), `is_deleted` (bool, soft-delete), `network_type`
  ('wifi' | 'lte' | 'gemini'), `source_repo`, `last_checked_at`, `updated_at`.
- **`repos`** — GitHub sources to scrape. `id`, `repo_url`, `enabled` (bool),
  `created_at`.
- **`repo_stats`** — per-repo analytics. `repo_url` (conflict key),
  `files_found`, `configs_extracted`, `configs_working`, `wifi_count`,
  `lte_count`, `gemini_count`, `last_sync_at`, `updated_at`.
- **`worker_status`** — single row, `id = 'worker'`. `state` ('idle' |
  'syncing'), `last_seen`, `last_sync_at`, `last_result` (JSON), `updated_at`.
- **`sync_requests`** — the admin→worker trigger queue. `id`, `kind`
  ('full'|'lte'|'gemini'|'latency'; anything not lte/gemini/latency = full),
  `processed_at` (null = pending), `result` (JSON).
- **`users`** — app user records (NOTE: the table is `users`, not `profiles`).
  `id` (uuid = auth user id), `email`, `role` ('user' | 'admin'),
  `banned_until`, `created_at`.
- **`subscriptions`** — `id`, `user_id`, `plan` (int), `network_type`,
  `status` ('pending'|'active'|'rejected'|'expired'), `end_at`, `sub_token`,
  `server_count`, `created_at`.
- **`payments`** — `id`, `user_id`, `subscription_id`, `plan`, `amount_rub`,
  `receipt_base64`, `admin_message`, `status` ('pending'|...), `created_at`.
- **`sub_devices`** — devices seen per subscription. `subscription_id`,
  `ip_address`, `device_type`, `last_seen_at`.
- **`support_messages`** — chat. `user_id`, `body`, `created_at`, `sender`.
- **`ggsel_keys`** — pre-purchased GGSel 16-digit keys. `id`, `key_code`, `plan`,
  `is_used`, `used_by`, `used_at`.

---

## 4. The Tester Worker (`/worker`) — Deep Dive
Runs locally via `start-worker.bat` → `node src/index.js`. Entry points:
`src/index.js` (long-running) and `src/run-once.js` (`npm run sync`, one-shot).

### 4.1 Core sync (`worker/src/sync.js` → `runSync()`)
1. Reads enabled rows from `repos`.
2. **GitHub scrape (`github.js`):** resolves the default branch, lists `.txt`
   /`.md`/extension-less files via the git-tree API, fetches raw content,
   regex-extracts `vless|vmess|trojan|ss|ssr|hysteria2|hy2|tuic` URIs,
   de-duplicated by SHA-256 (`parse.js`).
   - **Guard:** if 0 configs are discovered (GitHub unreachable), the run
     **aborts without wiping** the existing pool.
3. **Real test (`test.js` → `xray-knife`):** writes candidates to a temp file
   and runs roughly:
   `xray-knife http -f <in> -o <out> -x txt -t <concurrency> -d <maxDelayMs> -z <core> -u <testURL>`
   Survivors are read back from `<out>`. If the binary is missing it falls back
   to a weaker TCP-reachability check. Sampling is capped by `MAX_CONFIGS`.
   Afterwards `cleanupNetwork()` kills stray cores and resets the Windows proxy.
4. **GeoIP (`geoip.js`):** ip-api batch lookups → country + flag.
5. **Sync:** upsert survivors (conflict on `config_hash`), soft-handle removals,
   then refresh `repo_stats` and `worker_status`. All Supabase writes go through
   `withRetry()` (4 attempts, exponential backoff).

> **Scheduled cron is currently DISABLED** in `index.js` (commented out) — scans
> run only on manual admin trigger.

### 4.2 Network re-checks (LTE / Gemini / Latency)
The live pool is retested over the worker's *current* connection:
- **`runLteRecheck()`** — survivors over LTE become `network_type='lte'`
  (work on mobile + Wi-Fi); the rest are demoted to `wifi`. Nothing is deleted.
- **`runGeminiWifiRecheck()` / `runGeminiLteRecheck()`** — REAL Gemini
  availability, FAST (`worker/src/gemini.js`, `classifyGeminiPool`). What decides
  Gemini is the server's **exit-IP country**, not reachability of a Google URL.
- **`runLatencyCheck()`** — TCP ping pass to refresh `latency_ms`.

### 4.3 The "LTE → TypeError: terminated" issue (`worker/src/supa.js`)
**Do NOT reintroduce the `Connection: close` "fix".** History + correct account:

- **Original symptom:** on a phone LTE hotspot (in Russia), Supabase calls hang
  ~1 min then throw a bare `TypeError: terminated`; on home Wi-Fi everything
  works. The worker is restarted fresh *while already on LTE*.
- **The discredited theory:** "Node reuses a dead Wi-Fi keep-alive socket after
  switching networks; force `Connection: close`." This is **wrong here** — a
  freshly-started process on LTE has an empty connection pool (no socket to
  reuse), and stale-socket reuse fails in milliseconds, not after ~60s. The most
  likely real cause is **carrier-path interference** (CGNAT/mobile DPI/lower MTU)
  on the LTE path to `*.supabase.co`, which no client-side socket tweak can fix.
- **The actual bug that fix introduced:** supabase-js passes a **`Headers`
  instance**; the old `{...options.headers, Connection:'close'}` spread produced
  `{}` and **dropped `apikey`/`Authorization`** — every request went out
  unauthenticated. (Verified empirically on Node v24.)
- **Current `supa.js`:** a module-scope `undici` `Agent` dispatcher with a short
  **connect timeout** (fail fast + retryable, env `SUPA_CONNECT_TIMEOUT_MS`),
  **generous** `headersTimeout`/`bodyTimeout` (don't abort slow-but-working
  bulk upserts), short keep-alive (no stale reuse), an `AbortController` hard
  ceiling, and — crucially — it **passes headers through untouched** (auth
  preserved) and **surfaces `err.cause`** so logs show the real reason
  (`UND_ERR_CONNECT_TIMEOUT`, `ECONNRESET`, `ERR_TLS_*`, …) instead of
  `terminated`. `closeSupa()` closes the dispatcher before a hard exit (avoids a
  Windows libuv `UV_HANDLE_CLOSING` assertion). All knobs are env-tunable.

### 4.4 Realtime admin triggers (`index.js`)
- A **presence** channel (`worker_presence`) publishes the worker's live state so
  the dashboard shows Online/Syncing/Offline.
- A **postgres_changes** subscription on `sync_requests` (INSERT) triggers an
  instant drain; a **15s poll** (`REQUEST_POLL_MS`) is the reliability backstop so
  nothing is missed if the websocket drops.

---

## 5. The Web App (`/src`) — Deep Dive & Security Model

### 5.1 Auth & Roles
- Google OAuth via `GoogleButton.tsx` → `/auth/callback`.
- `src/middleware.ts` enforces locale routing + session refresh.
- Admin gate: `requireAdmin()` (`src/lib/admin.ts`) verifies the session, looks
  up `role` in the **`users`** table, and returns a service-role client. The
  admin email is also referenced directly in `Navbar.tsx`.

### 5.2 Admin Dashboard (`/admin/*`)
- Pages: `admin` (stats), `admin/servers`, `admin/servers/deleted`,
  `admin/repos`, `admin/users`, `admin/support`.
- **Advanced Stats:** Recharts-based Dashboard with MRR, ARPU, Protocol Analysis,
  and Time-Series Analytics (Revenue & User growth) loaded via custom `admin_revenue_by_day` views.
- **Deleted Servers:** Servers are soft-deleted (`is_deleted=true`) to keep historical
  data intact, with a UI panel to recover them.

### 5.3 Zero-Trust Security & Rate Limits
- **OOM Prevention:** All public list pages and admin list pages (e.g., users, support, servers)
  now use `.limit(1000)` to prevent PostgreSQL from loading infinite rows into Vercel Serverless
  functions and causing Out-of-Memory crashes.
- **Mass Assignment Protection:** Next.js Server Actions (like `submitManualPayment`) explicitly
  extract only safe fields (`amount_rub`, `plan`, `receipt_base64`) from `FormData` to prevent
  malicious users from injecting `status: "approved"` or assigning payments to other users.
- **Storage Exhaustion DoS:** Check constraints in `schema.sql` (`check (length(receipt_base64) < 2000000)`)
  and runtime checks in Server Actions strictly limit the size of uploaded receipts to ~1.5MB.
- **Data Integrity:** Added `UNIQUE INDEX` on `sub_devices(subscription_id, ip_address)` with
  upsert conflict resolution to prevent duplicate tracking rows on highly active endpoints.
- **Race Condition Prevention:** The GGsel key redemption logic uses strict RLS and optimistic
  locking. It checks if the key is already used *inside* a `single()` Supabase query and prevents
  multi-click or concurrent automation from redeeming the same key twice.

### 5.4 Realtime singleton safety (`useWorkerPresence.ts`)
Next.js re-evaluates client modules aggressively. Before `.channel().on().subscribe()`, query
`supabase.getChannels()` and `removeChannel()` any existing one to prevent leakages.

---

## 6. Design System & Motion
- **Theme:** deep-space galaxy. Colors: void `#0a0a1a`, surface `#12122b`,
  primary violet `#7c3aed`, accent cyan `#22d3ee`.
- **Surfaces:** `.glass` (blur + inset highlight + shadow).
- **Cosmic backdrop:** `SpaceBackground.tsx` — CSS-only drifting starfield + nebula glows.
- **Accessibility:** a global `prefers-reduced-motion` guard neutralizes CSS animation.

---

## 7. Rules for AI Agents
1. **Worker network code:** keep Supabase calls fail-fast, auth-preserving, and
   `err.cause`-surfacing. Never spread a `Headers` instance into a plain object.
2. **Security First:** Always assume `FormData` in Server Actions is malicious. Never spread raw data
   into a `.insert()`. Always whitelist fields.
3. **Database Scalability:** Never use `.select('*')` without a `.limit()` on unbounded tables.
4. **i18n is mandatory.** No hardcoded UI strings — update BOTH `messages/en.json` and `messages/ar.json`.
5. **Realtime:** don't touch the `useWorkerPresence` / `WorkerStatus` singleton pattern without understanding 5.4.
6. **Prefer standard Tailwind utilities;** reuse the design tokens in §6 instead of re-inventing shadows/gradients.

---

## 8. Changelog (recent, load-bearing)
- **Virtual Balance URI Rewriter** — Refactored the "Balance Mode" to use dynamic, on-the-fly URI rewriting inside `/api/sub/[token]/route.ts`. Instead of destructively modifying database rows, the API now transparently swaps "Gemini" tier tags for Standard tags at request time, meaning clients instantly see the updated server names while the database retains the original `network_type` source of truth.
- **Strict VLESS/TCP/TLS Parsing Enforcement** — Unified validation logic using `looksLikeConfig` across both GitHub ingestion (`liveness-scan.js`) and database re-syncs (`sync.js`). Any server configurations leaking into the DB via previous loopholes (like xhttp or shadowsocks) are actively filtered out.
- **Protocol Visualization Update** — Modified the `admin_stats` UI to parse `config_uri` dynamically, distinguishing between `VLESS TCP/TLS` and `VLESS TCP/REALITY` for more accurate chart visualisations.
- **Time-Series Advanced Admin Stats** — Implemented MRR, ARPU, Daily Revenue (AreaChart), and Daily User Signups (BarChart) using Supabase views for massive scalability and real-time insights.
- **Zero-Trust Security Pass** — Hardened Server Actions against Mass Assignment, locked down Database sizing limits to prevent OOM / Storage Exhaustion DoS attacks, and implemented Race Condition prevention for the GGSel system.
- **Soft Delete Servers Pipeline** — Changed server deletion to be non-destructive (`is_deleted=true`), allowing the admin to recover incorrectly-flagged servers from a dedicated Trash dashboard.
- **Worker `supa.js` rewritten** — Fixed the bug where the old `Connection: close` custom fetch was dropping auth headers.
- **DPI Blocking & Split Tunneling Analysis** — Discovered that the "TypeError: terminated" issue in the worker was caused by Russian ISP DPI (specifically on LTE networks) blocking new outbound TCP connections to the Supabase domain. Fixed by recommending Admin to use Split-Tunnel VPN on `xray.exe`.

*End of Document. Proceed with confidence — and accuracy.*
