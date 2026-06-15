-- ===========================================================================
-- candidates — global liveness pool maintained by the GitHub Action
-- (.github/workflows/liveness.yml → worker/src/liveness-scan.js).
--
-- PURPOSE: a non-Russia GitHub runner tests every discovered config for basic
-- liveness (real xray-knife protocol test) + egress country, on a schedule.
-- The LOCAL worker then skips configs that GitHub positively confirmed DEAD,
-- so it only deep-tests known/likely-alive servers from Russia.
--
-- This is ADDITIVE and REVERSIBLE: it never touches `servers`. Drop this table
-- and remove the worker's skip step to return to the original behavior.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================
create table if not exists public.candidates (
  config_hash text primary key,        -- sha256 of the raw config URI (stable id)
  config_uri  text not null,
  source_repo text,
  protocol    text,
  exit_cc     text,                     -- egress country (ISO-2) measured THROUGH the tunnel
  alive       boolean not null default false,
  scanned_at  timestamptz not null default now()
);

create index if not exists candidates_alive_idx on public.candidates (alive);
create index if not exists candidates_scanned_at_idx on public.candidates (scanned_at);

-- Service-role only (the worker + the Action both use the service-role key,
-- which bypasses RLS). Enabling RLS with no policies blocks anon/public access.
alter table public.candidates enable row level security;
