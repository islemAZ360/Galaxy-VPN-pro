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
VLESS proxy configs that survive sophisticated censorship (Russia's TSPU DPI). It has three halves:
1. **GitHub Actions Liveness Scan (`liveness-scan.js`):** Scrapes GitHub repos,
   strictly filters URIs (VLESS+Reality ONLY), does a wide 100-thread scan to
   weed out dead servers, and writes survivors to the `candidates` table.
2. **PC Worker (`index.js` / SourceCraft Runner):** Pulls from `candidates`,
   runs a deep DPI penetration test via `xray-knife` (xray core), applies the
   Quality Gate (latency < 1000ms), and upserts survivors into the `servers`
   table with Wi-Fi tier + Gemini classification.
3. **Phone Worker (`termux-watcher.js`):** Runs on an Android phone in Termux
   on real Russian LTE. Watches for triggers (manual from dashboard or automatic
   after PC finishes Wi-Fi scan), then re-tests Wi-Fi survivors via `xray-knife`
   on the live LTE network. Promotes passing servers to LTE tier.
4. **The Web App (`/src`):** A Next.js 15 App Router site that authenticates
   users (Google OAuth), lets the admin manage servers, sells time-based
   subscriptions, and hands working configs to users.

> The local workers MUST run from the target network (Russia). Testing elsewhere
> measures the wrong path and lets DPI-blocked servers through.

---

## 2. Tech Stack
- **Framework:** Next.js 15 (App Router, React 19 — Server + Client Components).
- **Styling:** Tailwind CSS v3 (dark, glassmorphic). Custom tokens in
  `tailwind.config.ts` + `globals.css`.
- **Motion:** `framer-motion` (scroll reveals, menus, toasts) and `three.js`
  (the hero shader). A shared CSS motion layer in `globals.css`.
- **i18n:** `next-intl`. `src/middleware.ts` handles `/[locale]` routing.
  Strings live in `messages/en.json`, `messages/ar.json` (Arabic = RTL), and
  `messages/ru.json` (Russian).
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, RLS).
- **Worker runtime:** Node.js **>= 20** (ESM). Uses `xray-knife` built on the
  `xray` core. On Android/Termux, `xray-knife` must be **built from source**
  with Go's PIE mode (`-buildmode=pie`) to avoid the Android linker error
  `e_type: 2` (ET_EXEC not supported; only ET_DYN/PIE binaries are allowed).

---

## 3. Database Schema (Supabase)
Columns below reflect what the code actually reads/writes.

- **`servers`** — the live, tested pool.
  `id` (uuid), `name`, `country`, `country_code`, `protocol`, `config_uri`,
  `config_hash` (sha256 of the original URI = stable identity), `latency_ms`,
  `is_working` (bool), `is_deleted` (bool, soft-delete), `network_type`
  ('wifi' | 'lte' | 'gemini_wifi' | 'gemini_lte' | 'whitelist' | 'gemini_whitelist'),
  `source_repo`, `last_checked_at`, `updated_at`.
- **`candidates`** — GitHub-sourced configs after liveness scan.
  `config_uri`, `config_hash`, `alive` (bool), `exit_cc` (egress country code),
  `source_repo`, `host_cc`, `host_country`.
- **`repos`** — GitHub sources to scrape. `id`, `repo_url`, `enabled` (bool),
  `created_at`.
- **`repo_stats`** — per-repo analytics. `repo_url` (conflict key),
  `files_found`, `configs_extracted`, `configs_working`, `wifi_count`,
  `lte_count`, `gemini_count`, `gemini_wifi_count`, `last_sync_at`, `updated_at`.
- **`worker_status`** — keyed by `id`. Two rows:
  - `id = 'worker'`: PC worker state (`state`, `last_seen`, `last_sync_at`,
    `last_result` JSON, `updated_at`).
  - `id = 'phone-worker'`: Phone heartbeat (`state`, `last_seen`).
- **`sync_requests`** — the admin→worker trigger queue. `id`, `kind`
  ('full'|'lte'|'gemini'|'latency'), `percentage` (Base slider 0–100),
  `details_percentage` (Gemini Scan slider 0–100), `processed_at` (null = pending),
  `result` (JSON), `requested_by`.
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

### 4.1 Strict Protocol Filtering (`parse.js`)
We employ an ultra-strict protocol filter because Russian DPI is incredibly advanced. We ONLY accept the following "Golden Combinations":
1. ✅ `VLESS + REALITY + TCP`
2. ✅ `VLESS + REALITY + GRPC`
3. ✅ `VLESS + REALITY + WS`

**Rules:**
- **Allowed Base:** `vless://` ONLY. (VMess, Trojan, SS are banned).
- **Allowed Shields:** `security=reality` ONLY. (Standard TLS is banned because of DPI fingerprinting vulnerabilities).
- **Allowed Wheels:** `type=tcp` OR `type=grpc` OR `type=ws`.
Any configuration failing this regex/URL parameter check is dropped immediately.

The `looksLikeConfig()` function in `parse.js` enforces this gate. It's applied:
- At extraction time (`extractConfigs()` → GitHub liveness scan)
- As a post-filter in `fetchAllPaginated()` to sanitize database reads

### 4.2 GitHub Liveness Scan (`liveness-scan.js`)
Runs as a GitHub Action.
1. Scrapes enabled `.txt`/`.md` files up to a **2MB file size limit** (prevents memory OOM crashes).
2. Extracts configs via `parse.js` strict rules.
3. Tests **ALL** extracted configs (no sampling limit) using `xray-knife http` with 100 concurrency and an 8000ms delay.
4. Writes survivors to the `candidates` table.

### 4.3 Deep Local Sync (`sync.js` / `test.js`)
Runs inside Russia (Termux or SourceCraft Runner).

#### Testing Pipeline (`test.js`)
1. **TCP Prefilter:** Fast TCP connect to check if the port is reachable before
   wasting time on the full DPI test. Servers that fail TCP are dropped early.
2. **xray-knife Deep Test:** Real VLESS+Reality handshake via `xray-knife http`
   using the `xray` core (`-z xray`). Outputs CSV with pass/fail, latency
   (`delayMs`), and egress country code (`location`).
3. **Fallback:** If `xray-knife` is unavailable, falls back to TCP-only testing.

#### xray-knife on Android/Termux
The `xray-knife` binary **must be built from source** on the Android device:
```bash
git clone https://github.com/lilendian0x00/xray-knife.git
cd xray-knife
go build -buildmode=pie -o ~/go/bin/xray-knife .
```
Standard pre-built binaries fail with `e_type: 2` because Android's linker
requires Position Independent Executables (PIE / ET_DYN). The `-buildmode=pie`
flag resolves this.

#### Cascade Modes
- **Wi-Fi Cascade** (`runWifiCascade`): Pulls from `candidates` → Phase 1: DPI
  test → Phase 2: Gemini split → Quality Gate (latency + country exclusion) →
  Upsert to `servers`. Run from PC.
- **LTE Cascade** (`runLteCascade`): Loads ONLY `is_working: true` +
  `is_deleted: false` WiFi-tier servers from `servers` → Phase 1: LTE DPI test
  → Phase 2: Gemini split → Classify tiers. Run from phone.
  - **Concurrency:** Default 3 (`TEST_CONCURRENCY` env) — low to avoid
    overwhelming Android's network stack or triggering Phantom Process Killer.
  - **Batch Size:** 50 servers per `xray-knife` invocation — small batches to
    let network sockets breathe between runs.

### 4.4 Four-Tier Network Classification
The tier is two INDEPENDENT dimensions: **NETWORK** (wifi | wifi+lte) ×
**GEMINI** (no | yes):

| Tier | WiFi | LTE | Gemini |
|---|---|---|---|
| `wifi` | ✅ | ❌ | ❌ |
| `gemini_wifi` | ✅ | ❌ | ✅ |
| `lte` | ✅ | ✅ | ❌ |
| `gemini_lte` | ✅ | ✅ | ✅ |
| `whitelist` | ✅ | ✅ | ❌ |
| `gemini_whitelist` | ✅ | ✅ | ✅ |

- The **Wi-Fi button** sets the Gemini dimension and PRESERVES the LTE dimension.
- The **LTE button** sets the LTE dimension and PRESERVES the Gemini dimension.
- **Gemini** is derived for FREE from GitHub's measured egress country
  (`candidates.exit_cc`) — only servers with unknown country are probed locally.

### 4.5 Termux Auto-LTE Watcher (`termux-watcher.js`)
Runs permanently on the Android phone via `npm run termux:watch`.
- **Polls** Supabase every 15 seconds for:
  1. **Manual LTE triggers** from the admin dashboard (reads `sync_requests`
     where `kind = 'lte'` and `processed_at IS NULL`).
  2. **Automatic triggers** after SourceCraft (PC) finishes a WiFi scan
     (detected via `worker_status.last_result.finishedAt` changes).
- **Slider Percentages:** The admin dashboard sends `percentage` (Base) and
  `details_percentage` (Gemini Scan) via the `sync_requests` table. The phone
  reads and applies these:
  - `basePercentage`: Controls what % of WiFi servers to re-test on LTE.
  - `detailsPercentage`: Controls what % of LTE survivors to probe for Gemini.
  - Automatic triggers after PC scan always use 100% for both.
- **Realtime Presence:** Subscribes to a Supabase Presence channel
  (`worker_presence`) so the dashboard can show phone online/offline status.
- **Heartbeat:** Upserts to `worker_status` with `id = 'phone-worker'`.
- **Server Counts:** Uses `HEAD count` queries (not row fetching) to avoid
  Supabase's 1000-row default limit.

### 4.6 Quality Gate
- **`MAX_LATENCY_MS`** (default `1000ms`): Servers slower than this (measured
  locally from Russia) never enter the pool.
- **`EXCLUDE_HOST_CC`** (default `RU,BY`): Servers hosted in Russia/Belarus are
  pointless for bypassing Russian censorship.

### 4.7 Supabase Pagination (`fetchAllPaginated`)
All large table reads use a parallel paginated fetcher:
- **Page size:** 20 rows (env `SUPA_PAGE_SIZE`, max 30).
- **Concurrency:** 8 parallel pages (env `SUPA_CONCURRENCY`).
- **DPI resilience:** If a full page is blocked, it splits into two half-pages.
  If those also fail, the page is skipped.
- **Post-filter:** `looksLikeConfig()` is applied to all rows with `config_uri`
  to strip any legacy non-VLESS+Reality entries from the database.

---

## 5. The Web App (`/src`) — Deep Dive & Security Model

### 5.1 Auth & Roles
- Google OAuth via `GoogleButton.tsx` → `/auth/callback`.
- `src/middleware.ts` enforces locale routing + session refresh.
- Admin gate: `requireAdmin()` (`src/lib/admin.ts`).

### 5.2 Admin Dashboard (`/admin/*`)
- **Advanced Stats:** Dashboard with MRR, ARPU, Protocol Analysis (specifically coloring `VLESS TCP/REALITY` purple/fuchsia), and Time-Series Analytics.
- **Trigger Actions:** Admin can trigger "Request LTE Scan" which inserts a row
  in `sync_requests` with `kind = 'lte'`, `percentage`, and
  `details_percentage` from the Base/Gemini Scan sliders. The phone's
  `termux-watcher.js` picks it up automatically.
- **Test Limit Sliders:** Two sliders in the repo manager:
  - **Base (%):** Controls what fraction of WiFi servers to re-test on LTE.
  - **Gemini Scan (%):** Controls what fraction of LTE survivors to probe for
    Gemini availability.

### 5.3 Zero-Trust Security & Rate Limits
- **OOM Prevention:** Public/admin list pages use `.limit(1000)`.
- **Mass Assignment Protection:** Server Actions explicitly extract only safe fields (`amount_rub`, `plan`, `receipt_base64`).
- **Storage Exhaustion DoS:** Check constraints in `schema.sql` (`receipt_base64 < 2000000`).
- **Race Condition Prevention:** The GGsel key redemption logic uses strict RLS and optimistic locking.

---

## 6. Design System & Motion
- **Theme:** deep-space galaxy. Colors: void `#0a0a1a`, surface `#12122b`,
  primary violet `#7c3aed`, accent cyan `#22d3ee`.
- **Surfaces:** `.glass` (blur + inset highlight + shadow).

---

## 7. Rules for AI Agents
1. **Worker network code:** keep Supabase calls fail-fast, auth-preserving, and
   `err.cause`-surfacing.
2. **Security First:** Always assume `FormData` in Server Actions is malicious.
3. **Database Scalability:** Never use `.select('*')` without a `.limit()` on
   unbounded tables. Use `HEAD count` queries (`{ count: 'exact', head: true }`)
   instead of fetching all rows just to count.
4. **i18n is mandatory.** No hardcoded UI strings.
5. **Realtime:** don't touch the `useWorkerPresence` / `WorkerStatus` singleton pattern without understanding channel teardown.
6. **Strict VPN Philosophy:** Do not add loose protocols (like basic TLS or VMess) without explicit user permission. The Russian DPI is ruthless.
7. **LTE Cascade must filter properly:** When fetching servers for LTE re-test,
   always filter `is_working: true, is_deleted: false` and post-filter for
   WiFi-tier network types. Never fetch ALL servers — the `servers` table
   contains legacy/dead entries that inflate the count.
8. **Android binary compatibility:** Any Go binary destined for Android/Termux
   must be built with `-buildmode=pie`. Pre-built Linux/AMD64 binaries will fail
   with `e_type: 2`.

---

## 8. Changelog (recent, load-bearing)
- **LTE Cascade Server Fetch Fix:** Fixed `runLteCascade` to only fetch
  `is_working: true, is_deleted: false` WiFi-tier servers. Previously fetched
  ALL 3575+ servers (including dead/deleted/legacy protocol entries) then
  `looksLikeConfig` dropped most of them, resulting in only ~249 being tested
  instead of the full WiFi pool.
- **Accurate Server Counts:** Replaced `getServerCounts()` in
  `termux-watcher.js` with `HEAD count` queries to avoid Supabase's default
  1000-row fetch limit that was capping the displayed count.
- **xray-knife Android PIE Fix:** Pre-built `xray-knife` binaries fail on
  Android with `e_type: 2`. Fixed by building from source with
  `go build -buildmode=pie`. Documented in build instructions.
- **LTE Concurrency Tuning:** Reduced default `TEST_CONCURRENCY` from 5 to 3
  and `batchSize` from 500 to 50 for Android stability. Prevents overwhelming
  mobile network sockets and triggering Android's Phantom Process Killer.
- **Ultimate Protocol Filter Enforcement (VLESS+REALITY):** Completely revamped `parse.js` to strictly drop standard TLS, VMESS, Trojan, and SS configs. We now ONLY accept `VLESS` with `security=reality` on `tcp`, `grpc`, or `ws` transports, closing the door on easily-blocked garbage servers.
- **Engine Reversion & OOM Fixes:** Switched local testing engine back to `xray` from `sing-box` for better stability. Added a 2MB file size cap in `github.js` tree scraper to prevent V8 out-of-memory errors on massive text files.
- **Liveness Scan Unleashed:** Removed the 15,000 server sampling limit in `liveness-scan.js`. The GitHub Action now brute-forces ALL strictly filtered candidates simultaneously.
- **Quality Gate (1000ms):** Emphasized the `MAX_LATENCY_MS` hard limit in the worker to ensure only ultra-responsive servers ever reach the user app.

*End of Document. Proceed with confidence — and accuracy.*
