# AI Developer Manual & Architecture Guide: GalaxyVPN Pro

**Welcome, AI Assistant.**
This is the ultimate source of truth for the `GalaxyVPN Pro` project. Read it meticulously before proposing architectural changes, debugging, or adding features. It documents the real logic, database schema, AI predictive engine, network-testing flow, and design/motion system as they exist in the codebase today. Where this file once disagreed with the code, the code won — see the changelog at the bottom.

---

## 1. Project Philosophy & Core Purpose
**GalaxyVPN Pro** distributes a highly-curated, continuously-tested, and AI-filtered pool of VLESS proxy configs designed to survive the world's most sophisticated censorship systems (e.g., Russia's TSPU DPI). 

The system operates as a **Microservice-inspired Architecture** divided into four massive pillars:
1. **GitHub Actions Liveness Scan (`liveness-scan.js`):** A massive cloud scraper that pulls configs from GitHub repos, applies strict VLESS+Reality regex filtering, runs a 100-thread concurrent TCP/HTTP scan to weed out dead servers, and writes the survivors to the `candidates` table.
2. **PC Worker (`index.js` / SourceCraft Runner):** Runs from within the target restricted network. It pulls from `candidates`, runs a deep DPI penetration test via `xray-knife`, applies Quality Gates (latency < 1000ms), optionally delegates predictive filtering to the local Python AI Engine, and upserts survivors to the `servers` table (Wi-Fi tier).
3. **Phone Worker (`termux-watcher.js`):** Runs on an Android phone via Termux on a live Russian LTE network. Watches for triggers from the Admin Dashboard, re-tests Wi-Fi survivors over LTE, and promotes passing servers to the LTE tier.
4. **The Next.js Web App (`/src`):** A beautiful, high-performance web platform that authenticates users, processes payments, displays advanced analytics, and hands out the final, vetted configs to subscribers based on their plans.

> **CRITICAL RULE:** The local workers (PC and Phone) MUST run from the target restricted network (Russia). Testing from Europe or America measures the wrong route and lets DPI-blocked servers leak into the production pool.

---

## 2. Tech Stack Ecosystem
- **Frontend / Fullstack Framework:** Next.js 15 (App Router, React 19).
- **Styling & UI:** Tailwind CSS v3 (dark theme, glassmorphism), `framer-motion` (micro-animations, scroll reveals), and `three.js` (hero background shaders).
- **i18n Localization:** `next-intl`. Middleware routes traffic to `/[locale]`. Fully supports English (`en`), Arabic (`ar` - RTL), and Russian (`ru`).
- **Backend & Database:** Supabase (PostgreSQL, Realtime Presence, Row Level Security, Auth).
- **Node.js Orchestration Workers:** Node.js >= 20 (ESM). Uses `xray-knife` built from the `xray` core.
- **AI Predictive Engine:** Python 3.14 (Virtual Environment `venv`), `XGBoost`, `scikit-learn`, `pandas`. Fully decoupled microservice.

---

## 3. Database Schema (Supabase)
*Columns below reflect what the code actually reads/writes in production.*

### Infrastructure Tables
- **`servers`**: The live, user-facing pool.
  `id`, `name`, `country`, `country_code`, `protocol`, `config_uri`, `config_hash` (sha256 identity), `latency_ms`, `is_working`, `is_deleted`, `network_type` ('wifi' | 'lte' | 'gemini_wifi' | 'gemini_lte' | 'whitelist'), `source_repo`, `last_checked_at`.
- **`candidates`**: GitHub-sourced configs post-liveness scan.
  `config_uri`, `config_hash`, `alive`, `exit_cc`, `source_repo`.
- **`repos` & `repo_stats`**: GitHub sources and their analytic metrics (`files_found`, `configs_extracted`, `wifi_count`, etc.).

### Worker & Orchestration Tables
- **`worker_status`**: Keyed by `id` ('worker' or 'phone-worker'). Tracks heartbeat, `last_seen`, and JSON `last_result`.
- **`sync_requests`**: The admin→worker trigger queue for LTE/Gemini scans. `kind`, `percentage`, `details_percentage`, `processed_at`, `result`.
- **`worker_settings`**: Global configuration flags, notably `ai_filtering` (boolean) which toggles the AI predictive engine.

### AI Engine Tables
- **`ml_dataset`**: The historical training ground. Every server tested by the worker logs its features (`latency_ms`, `network_type`, `port`, `exit_cc`) and its target outcome (`is_working`) here.
- **`ml_metrics`**: Model performance analytics. Records `accuracy`, `dataset_size`, and `created_at` every time `train.py` runs. Rendered directly in the Admin AI Dashboard.

### Users & E-commerce
- **`users`**: App records (tied to Auth). `id`, `email`, `role` ('user'|'admin'), `banned_until`.
- **`subscriptions`**: User access logic. `id`, `user_id`, `plan`, `network_type`, `status` ('pending'|'active'), `end_at`, `sub_token` (used in the app client).
- **`payments` & `ggsel_keys`**: Transaction history, receipt images (Base64), and pre-purchased redemption keys.

---

## 4. The Deep Penetration Workers (`/worker`)

### 4.1 Strict Protocol Filtering (`parse.js`)
Russian DPI is incredibly advanced. We ONLY accept "Golden Combinations":
1. ✅ `VLESS + REALITY + TCP`
2. ✅ `VLESS + REALITY + GRPC`
3. ✅ `VLESS + REALITY + WS`
*Any configuration failing the regex check for these specific parameters is instantly dropped.*

### 4.2 The Local Sync Pipeline (`test.js`)
Runs inside Russia.
1. **TCP Prefilter:** Fast TCP socket connection. If the port is closed, the server is dropped immediately, saving precious DPI testing time.
2. **xray-knife Deep Test:** Real VLESS+Reality handshake via `xray-knife http`. Outputs pass/fail, latency (`delayMs`), and egress country code (`location`).
3. **Android PIE Compatibility:** `xray-knife` on the Phone Worker MUST be compiled from source with `go build -buildmode=pie` to bypass the Android linker `e_type: 2` security restriction.

### 4.3 Network Classification Tiers (The Matrix)
Tiers are independent dimensions: **NETWORK** (wifi | lte) × **GEMINI** (no | yes).
- **Wi-Fi Cascade:** Pulls from candidates → DPI Test → Gemini Split → AI Filtering → Upsert.
- **LTE Cascade:** Pulls *only* Wi-Fi survivors → LTE DPI Test → Upsert to LTE tier.
- **Gemini Classification:** Determined by the egress country code (`candidates.exit_cc`). If a server routes through regions where Google Gemini operates freely, it gets the Gemini flag.

---

## 5. The AI Predictive Engine (`/galaxy-ai-engine`) - The Crown Jewel
To prevent the worker from wasting hours testing thousands of dead or slow servers, we built a fully decoupled Machine Learning Microservice using Python and **XGBoost**.

### 5.1 Architecture & Data Flow
The AI Engine operates alongside the Node.js Worker, communicating via local JSON files. It does NOT block the worker if it fails or is missing.

1. **Data Collection (Continuous):** Every time the Node.js worker tests a server, it pushes the exact features (Latency, Port, Country, Network Type) and the test result (`is_working`) to the Supabase `ml_dataset` table.
2. **Model Training (`train.py`):** 
   - An administrator runs `.\venv\Scripts\python.exe train.py`.
   - The script connects securely to Supabase, pulls the entire `ml_dataset`.
   - It performs Data Preprocessing: One-Hot Encoding for categorical features (Country, Network Type), fills missing values, and balances the classes.
   - It trains a highly optimized `XGBClassifier` and saves it locally as `model.xgb` along with feature columns in `model_columns.json`.
   - It evaluates accuracy using `train_test_split` and pushes the `accuracy` score directly to `ml_metrics` to be visualized in the Admin Dashboard.
3. **High-Speed Inference (`predict.py` & `sync.js`):**
   - When the worker is about to test a massive pool of servers, it checks if `ai_filtering` is enabled in the database and if `predict.py` exists.
   - The worker writes the server features to `temp_phase1.json` and spawns `python.exe predict.py`.
   - The Python script loads `model.xgb`, performs lightning-fast offline inference (0 network calls), calculates success probabilities for each server, and sorts them.
   - It writes the predictions to `temp_predictions.json`.
   - The Node.js worker reads the predictions, selects the top N% of servers, adds a **10% random exploration margin** (to ensure the model constantly discovers new server patterns), and drops the rest.

### 5.2 Why Python & XGBoost?
We migrated from a purely JavaScript-based CART decision tree to Python/XGBoost because:
- **Performance:** XGBoost handles complex, non-linear relationships in VPN latency and DPI blocking infinitely better than basic trees.
- **Ecosystem:** Python's `scikit-learn` and `pandas` allow for robust One-Hot encoding, scaling, and hyperparameter tuning.
- **Decoupled Safety:** By wrapping it in a Python VENV and executing it via `execFileAsync` in Node, the worker is completely shielded. If Python crashes or isn't installed (e.g., running on SourceCraft CI/CD), the Node worker gracefully falls back to normal 100% testing.

---

## 6. The Web App (`/src`) — Security & UI

### 6.1 Security Model (Zero-Trust)
- **OOM Prevention:** All public list pages use `.limit(1000)` to prevent massive database reads from crashing the Vercel serverless functions.
- **Mass Assignment Protection:** Server Actions explicitly destructure only safe fields (e.g., `amount_rub`, `plan`, `receipt_base64`).
- **Race Condition Prevention:** The GGSel key redemption logic relies on strict Supabase RLS and optimistic locking.
- **Storage Protection:** `schema.sql` enforces CHECK constraints (`length(receipt_base64) < 2000000`) to prevent DB exhaustion DoS attacks.

### 6.2 Admin Dashboard (`/admin`)
A premium, real-time control center featuring:
- **Financial Analytics:** MRR, ARPU, Revenue Growth charts.
- **AI Analytics Tab:** A dedicated page visualizing the XGBoost model's accuracy history over time, training dataset size, and a master toggle for predictive filtering.
- **Remote Orchestration:** Admins can trigger LTE or Gemini scans directly from the web, injecting tasks into `sync_requests` which the Android Termux Watcher picks up instantly via polling.

---

## 7. Rules for AI Agents
1. **Never Break the Decoupling:** The Node.js worker MUST NOT crash if the Python AI Engine is missing. Always check `fs.existsSync` for the `venv/Scripts/python.exe`.
2. **Database Scalability:** Never use `.select('*')` without a `.limit()` on unbounded tables. Use `HEAD count` queries (`{ count: 'exact', head: true }`) instead of fetching all rows just to count.
3. **i18n is Mandatory:** No hardcoded UI strings. Ever. The project uses English, Arabic, and Russian. Modify `ar.json`, `en.json`, and `ru.json` simultaneously.
4. **Security First:** Always assume `FormData` in Server Actions is malicious.
5. **Strict Protocol Philosophy:** Do not add loose protocols (like basic TLS or VMess) without explicit user permission. The Russian DPI is ruthless; VLESS+Reality is our only shield.
6. **Android Binary Compatibility:** Any Go binary destined for Android/Termux must be built with `-buildmode=pie`.

---

## 8. Changelog (The Evolution)
- **AI Engine Migration (Epic):** Replaced the experimental JavaScript CART model with a fully decoupled Python XGBoost Microservice. Implemented seamless feature encoding, `model.xgb` serialization, and a dedicated AI Analytics Dashboard in the Next.js Admin Panel.
- **LTE Cascade Server Fetch Fix:** Fixed `runLteCascade` to only fetch `is_working: true, is_deleted: false` WiFi-tier servers.
- **Accurate Server Counts:** Replaced `getServerCounts()` in `termux-watcher.js` with `HEAD count` queries to bypass Supabase's default 1000-row fetch limit.
- **xray-knife Android PIE Fix:** Fixed Android linker `e_type: 2` crashes by recompiling `xray-knife` from source using `go build -buildmode=pie`.
- **Ultimate Protocol Filter Enforcement:** Completely revamped `parse.js` to strictly drop standard TLS, VMESS, Trojan, and SS configs. We now ONLY accept `VLESS` with `security=reality`.
- **Liveness Scan Unleashed:** Removed the 15,000 server sampling limit in `liveness-scan.js`. The GitHub Action now brute-forces ALL strictly filtered candidates simultaneously.

*End of Document. You are now armed with the full knowledge of GalaxyVPN Pro. Proceed with absolute confidence.*
