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
VLESS proxy configs that survive sophisticated censorship (Russia's TSPU DPI). It has two halves:
1. **The Tester Worker (`/worker`):** A dual-environment Node.js process:
   - **GitHub Actions (Liveness Scan):** Scrapes GitHub, strictly filters URIs, and does a wide 100-thread scan to weed out dead servers.
   - **Local Worker (Inside Russia):** Runs a deep DPI penetration test (`xray` core) and an aggressive latency check (`< 1000ms`), syncing ONLY the ultra-fast survivors to Supabase.
2. **The Web App (`/src`):** A Next.js 15 App Router site that authenticates
   users (Google OAuth), lets the admin manage servers, sells time-based
   subscriptions, and hands working configs to users.

> The local worker MUST run from the target network (Russia). Testing elsewhere
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
- **Worker runtime:** Node.js **>= 20** (ESM). Uses `xray-knife` built on the `xray` core.

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

### 4.1 Strict Protocol Filtering (`parse.js`)
We employ an ultra-strict protocol filter because Russian DPI is incredibly advanced:
- **Allowed Base:** `vless://` ONLY. (VMess, Trojan, SS are banned).
- **Allowed Shields:** `security=reality` ONLY. (Standard TLS is banned because of DPI fingerprinting vulnerabilities).
- **Allowed Wheels:** `type=tcp` OR `type=grpc` OR `type=ws`.
Any configuration failing this regex/URL parameter check is dropped immediately.

### 4.2 GitHub Liveness Scan (`liveness-scan.js`)
Runs as a GitHub Action.
1. Scrapes enabled `.txt`/`.md` files up to a **2MB file size limit** (prevents memory OOM crashes).
2. Extracts configs via `parse.js` strict rules.
3. Tests **ALL** extracted configs (no sampling limit) using `xray-knife http` with 100 concurrency and an 8000ms delay.
4. Writes survivors to the `candidates` table.

### 4.3 Deep Local Sync (`sync.js` / `test.js`)
Runs inside Russia (Termux or SourceCraft Runner).
1. Pulls from `candidates`.
2. Tests using `xray` core. We specifically use `xray` instead of `sing-box` for better Russian ISP compatibility.
3. **The Quality Gate:** Measures exact `latencyMs`. Any server responding slower than `MAX_LATENCY_MS` (default `1000ms`) from inside Russia is immediately discarded.
4. Upserts ultra-fast, REALITY-shielded survivors into the `servers` table.

---

## 5. The Web App (`/src`) — Deep Dive & Security Model

### 5.1 Auth & Roles
- Google OAuth via `GoogleButton.tsx` → `/auth/callback`.
- `src/middleware.ts` enforces locale routing + session refresh.
- Admin gate: `requireAdmin()` (`src/lib/admin.ts`).

### 5.2 Admin Dashboard (`/admin/*`)
- **Advanced Stats:** Dashboard with MRR, ARPU, Protocol Analysis (specifically coloring `VLESS TCP/REALITY` purple/fuchsia), and Time-Series Analytics.
- **Trigger Actions:** Admin can trigger "Request Wi-Fi Scan" which inserts a row in `sync_requests`, waking up the Termux/Runner to execute `sync.js`.

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
3. **Database Scalability:** Never use `.select('*')` without a `.limit()` on unbounded tables.
4. **i18n is mandatory.** No hardcoded UI strings.
5. **Realtime:** don't touch the `useWorkerPresence` / `WorkerStatus` singleton pattern without understanding channel teardown.
6. **Strict VPN Philosophy:** Do not add loose protocols (like basic TLS or VMess) without explicit user permission. The Russian DPI is ruthless.

---

## 8. Changelog (recent, load-bearing)
- **Ultimate Protocol Filter Enforcement (VLESS+REALITY):** Completely revamped `parse.js` to strictly drop standard TLS, VMESS, Trojan, and SS configs. We now ONLY accept `VLESS` with `security=reality` on `tcp`, `grpc`, or `ws` transports, closing the door on easily-blocked garbage servers.
- **Engine Reversion & OOM Fixes:** Switched local testing engine back to `xray` from `sing-box` for better stability. Added a 2MB file size cap in `github.js` tree scraper to prevent V8 out-of-memory errors on massive text files.
- **Liveness Scan Unleashed:** Removed the 15,000 server sampling limit in `liveness-scan.js`. The GitHub Action now brute-forces ALL strictly filtered candidates simultaneously.
- **Admin UI Cleanup:** Removed the "Test Latency" button as the worker's deep check populates accurate latency directly. Updated the Protocol Strength Analysis chart to heavily feature our REALITY combinations with distinctive colors.
- **Quality Gate (1000ms):** Emphasized the `MAX_LATENCY_MS` hard limit in the worker to ensure only ultra-responsive servers ever reach the user app.

*End of Document. Proceed with confidence — and accuracy.*
