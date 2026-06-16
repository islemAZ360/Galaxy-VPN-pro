-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- ---------------------------------------------------------------------------
-- sub_devices — per-subscription device/IP log that powers the 24h anti-sharing
-- limit (max 20 unique IPs per subscription in a rolling 24h window).
--
-- Written ONLY by the service-role key from:
--   src/app/api/sub/[token]/route.ts   (upsert on every subscription fetch)
-- Read by the profile page and the admin users page (also via service-role).
--
-- CRITICAL: the route upserts with onConflict (subscription_id, ip_address,
-- user_agent). That requires a UNIQUE index on EXACTLY those columns, or the
-- upsert errors at runtime and device tracking silently stops. This file
-- creates it. If the table was created by hand earlier (without user_agent or
-- without the unique index), the ALTER/INDEX statements below reconcile it.
-- ---------------------------------------------------------------------------

create table if not exists public.sub_devices (
  id              bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  ip_address      text not null,
  user_agent      text not null default 'unknown',
  device_type     text,
  last_seen_at    timestamptz not null default now()
);

-- Reconcile a hand-made table that may predate the user_agent column.
alter table public.sub_devices add column if not exists user_agent text;
update public.sub_devices set user_agent = 'unknown' where user_agent is null;
alter table public.sub_devices alter column user_agent set default 'unknown';
alter table public.sub_devices alter column user_agent set not null;

-- Collapse any pre-existing duplicates before adding the unique index (ctid works
-- even if a hand-made table has no id column). Keeps one row per (sub, ip, ua).
delete from public.sub_devices a
using public.sub_devices b
where a.ctid < b.ctid
  and a.subscription_id = b.subscription_id
  and a.ip_address      = b.ip_address
  and a.user_agent      = b.user_agent;

-- The unique key the route's upsert relies on. Names without spaces matter:
-- the route passes onConflict: 'subscription_id,ip_address,user_agent'.
create unique index if not exists sub_devices_sub_ip_ua_key
  on public.sub_devices (subscription_id, ip_address, user_agent);

-- Speeds up the 24h window query: where subscription_id = ? and last_seen_at >= ?
create index if not exists sub_devices_sub_lastseen_idx
  on public.sub_devices (subscription_id, last_seen_at desc);

-- All access is via the service-role key (bypasses RLS). Enable RLS with NO
-- public policies so anon/authenticated clients can never read other users' IPs.
alter table public.sub_devices enable row level security;

-- Optional housekeeping: rows older than 48h are never counted (the window is
-- 24h) and only grow the table. You can prune them periodically, e.g.:
--   delete from public.sub_devices where last_seen_at < now() - interval '48 hours';
