-- Run in Supabase SQL Editor. Safe to re-run.
-- Adds LTE/Wi-Fi classification to servers + subscriptions, and a "kind" to
-- sync_requests so the admin can ask for either a full sync or an LTE re-check.

-- servers: 'wifi' = works on Wi-Fi (baseline) · 'lte' = works on mobile data too.
alter table public.servers
  add column if not exists network_type text not null default 'wifi';
create index if not exists idx_servers_network on public.servers(network_type);

-- subscriptions remember which pool the customer bought.
alter table public.subscriptions
  add column if not exists network_type text not null default 'wifi';

-- sync_requests: 'full' = re-fetch repos + retest + prune · 'lte' = retest the
-- existing pool over the worker's current (LTE) connection and reclassify.
alter table public.sync_requests
  add column if not exists kind text not null default 'full';
