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
- **`runGeminiRecheck()`** — tests reachability of a Gemini endpoint through each
  proxy; those that pass become `gemini`.
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
- **To confirm the root cause on LTE:** read the logged `err.cause.code`, and run
  an out-of-Node reachability probe on the same link:
  `Invoke-WebRequest "$env:SUPABASE_URL/rest/v1/" -Headers @{ apikey = $env:SUPABASE_SERVICE_ROLE_KEY }`.
  If that also hangs/resets, the worker code is exonerated — it's the carrier.

### 4.4 Realtime admin triggers (`index.js`)
- A **presence** channel (`worker_presence`) publishes the worker's live state so
  the dashboard shows Online/Syncing/Offline.
- A **postgres_changes** subscription on `sync_requests` (INSERT) triggers an
  instant drain; a **15s poll** (`REQUEST_POLL_MS`) is the reliability backstop so
  nothing is missed if the websocket drops.
- `drainPending()` claims all pending rows at once and runs them in order
  full → lte → gemini → latency. On boot, stale pending requests are cleared so
  they don't fire on the wrong network.

---

## 5. The Web App (`/src`) — Deep Dive

### 5.1 Auth & Roles
- Google OAuth via `GoogleButton.tsx` → `/auth/callback`.
- `src/middleware.ts` enforces locale routing + session refresh.
- Admin gate: `requireAdmin()` (`src/lib/admin.ts`) verifies the session, looks
  up `role` in the **`users`** table, and returns a service-role client. The
  admin email is also referenced directly in `Navbar.tsx`.

### 5.2 Admin Dashboard (`/admin/*`)
- Pages: `admin` (stats), `admin/servers`, `admin/servers/deleted`,
  `admin/repos`, `admin/users`, `admin/support`.
- `RepoManager.tsx` (add/remove repos, show stats, fire re-check buttons),
  `WorkerStatus.tsx` (live presence), `TestLatencyButton.tsx`,
  `PaymentReview.tsx`, `UserRow.tsx`.
- Buttons enqueue a `sync_requests` row; the worker picks it up (see 4.4).
- **Hydration gotcha:** components rendering live dates / reducer totals use
  `suppressHydrationWarning` on the wrapping element.

### 5.3 Realtime singleton safety (`useWorkerPresence.ts`)
Next.js re-evaluates client modules aggressively. Before
`.channel().on().subscribe()`, query `supabase.getChannels()` and
`removeChannel()` any existing one, or Supabase throws
"cannot add 'presence' callbacks after 'subscribe()'".

### 5.4 User Dashboard (`/profile`)
Shows each subscription (pending/active/rejected/expired), countdown, the
per-sub subscription URL (`SubLink.tsx`), connected devices, and a plan picker.

---

## 6. Design System & Motion
- **Theme:** deep-space galaxy. Colors: void `#0a0a1a`, surface `#12122b`,
  primary violet `#7c3aed`, accent cyan `#22d3ee` (see `tailwind.config.ts`).
- **Surfaces:** `.glass` (blur + inset highlight + shadow). Hover lift via
  `.card-lift`; primary CTA via `.btn-primary`; tactile `.pressable`; animated
  `.link-underline`.
- **Cosmic backdrop:** `SpaceBackground.tsx` — CSS-only drifting starfield +
  nebula glows (zero JS), used behind auth/marketing surfaces.
- **Hero:** `FloatingLines.tsx` — a three.js shader. It **pauses its rAF loop
  when off-screen (IntersectionObserver) or in a hidden tab**, resumes without a
  time jump (delta accumulation), and freezes under reduced motion.
- **Motion vocabulary:**
  - `FadeIn` / `FadeInStagger` / `FadeInItem` (framer-motion) — scroll-reveal
    with an ease-out-expo curve `[0.16,1,0.3,1]`, subtle 24px travel, optional
    blur-in.
  - CSS utilities in `globals.css`: `.animate-fade-up`, `.animate-grow-x`,
    `.stagger` (auto-cascading children), plus `transitionTimingFunction` tokens
    (`ease-out-expo`, `ease-out-quart`, `ease-spring`).
- **Accessibility:** a global `prefers-reduced-motion` guard neutralizes CSS
  animation/transition; framer components check `useReducedMotion()`; the WebGL
  hero and marquee freeze. Always preserve this when adding motion.

---

## 7. Rules for AI Agents
1. **Worker network code:** keep Supabase calls fail-fast, auth-preserving, and
   `err.cause`-surfacing. Never spread a `Headers` instance into a plain object.
   Never re-add a blanket `Connection: close` as a "fix".
2. **i18n is mandatory.** No hardcoded UI strings — use
   `useTranslations('namespace')` / `getTranslations` and update BOTH
   `messages/en.json` and `messages/ar.json`.
3. **Respect reduced motion.** Any new animation must honor the global guard /
   `useReducedMotion()`.
4. **Realtime:** don't touch the `useWorkerPresence` / `WorkerStatus` singleton
   pattern without understanding 5.3.
5. **Don't assume non-null Supabase data.** Use optional chaining; tables are
   `users`/`servers`/`repos`/… as listed in §3 (not `profiles`).
6. Prefer standard Tailwind utilities; reuse the design tokens in §6 instead of
   re-inventing shadows/gradients.

---

## 8. Changelog (recent, load-bearing)
- **Worker `supa.js` rewritten** — see §4.3. The old `Connection: close` custom
  fetch was dropping auth headers and was based on a misdiagnosis.
- **DPI Blocking & Split Tunneling Analysis** — Discovered that the "TypeError: terminated" issue in the worker was caused by Russian ISP DPI (specifically on LTE networks) blocking new outbound TCP connections to the Supabase domain. 
  - *Solution:* The worker MUST be run locally with a VPN (e.g., Happ) active to allow Node.js to reach Supabase. 
  - *Split-Tunneling:* To ensure `xray-knife` still tests servers over the real Russian LTE connection (not through the VPN tunnel), users must use "Per-App Proxy Settings" (Direct connection for selected applications) in Happ and add both `xray-knife.exe` and `xray.exe` to the bypass list. If `xray.exe` is omitted, the 50 concurrent tests route through the VPN, causing the VPN server to disconnect due to network flood/abuse.
  - *Admin UI:* Added a "Local Tester Guide" button in the Repos section to document these steps for admins.
- **Site-wide design + motion pass** — design tokens, professional motion system
  with reduced-motion support, WebGL hero performance gating, cosmic backdrop,
  and redesigned home/admin/login/profile/checkout/support surfaces (§6).

*End of Document. Proceed with confidence — and accuracy.*
