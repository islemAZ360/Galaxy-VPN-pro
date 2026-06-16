-- ===========================================================================
-- repo_stats — per-repository counters shown in the admin "Repos" tab.
--
--   files_found, configs_extracted  → written by the GitHub liveness scan
--       (.github/workflows/liveness.yml → worker/src/liveness-scan.js), which is
--       now the discovery engine and knows these per repo.
--   configs_working, *_count        → written by the LOCAL tester worker's
--       updateRepoStats() after each Wi-Fi/LTE cascade.
--
-- A newly-added repo used to stay "Not synced yet" forever because nothing
-- created its row; the scan now upserts a row for every enabled repo.
--
-- Safe to re-run (idempotent). Run once in the Supabase SQL editor.
-- ===========================================================================
create table if not exists public.repo_stats (
  repo_url          text primary key,
  files_found       integer not null default 0,
  configs_extracted integer not null default 0,
  configs_working   integer not null default 0,
  wifi_count        integer not null default 0,
  lte_count         integer not null default 0,
  gemini_count      integer not null default 0,
  gemini_wifi_count integer not null default 0,
  gemini_lte_count  integer not null default 0,
  last_sync_at      timestamptz,
  updated_at        timestamptz not null default now()
);

-- Add any missing columns / defaults on an already-existing table (no-op if present).
alter table public.repo_stats add column if not exists files_found       integer not null default 0;
alter table public.repo_stats add column if not exists configs_extracted integer not null default 0;
alter table public.repo_stats add column if not exists configs_working   integer not null default 0;
alter table public.repo_stats add column if not exists wifi_count        integer not null default 0;
alter table public.repo_stats add column if not exists lte_count         integer not null default 0;
alter table public.repo_stats add column if not exists gemini_count      integer not null default 0;
alter table public.repo_stats add column if not exists gemini_wifi_count integer not null default 0;
alter table public.repo_stats add column if not exists gemini_lte_count  integer not null default 0;
alter table public.repo_stats add column if not exists last_sync_at      timestamptz;
alter table public.repo_stats add column if not exists updated_at        timestamptz not null default now();

-- Service-role (worker + admin client) bypasses RLS; enabling it blocks anon access.
alter table public.repo_stats enable row level security;
