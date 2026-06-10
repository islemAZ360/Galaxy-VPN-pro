-- Run in Supabase SQL Editor. Safe to re-run.
-- A single-row heartbeat the local Tester Worker updates so the admin dashboard
-- can show whether the worker is online and the result of the last sync.

create table if not exists public.worker_status (
  id           text primary key default 'worker',
  state        text not null default 'idle',   -- idle | syncing
  last_seen    timestamptz,                     -- heartbeat
  last_sync_at timestamptz,
  last_result  jsonb,
  updated_at   timestamptz not null default now()
);

insert into public.worker_status (id) values ('worker')
  on conflict (id) do nothing;

alter table public.worker_status enable row level security;

-- Admin can read the status; the worker writes via the service_role (bypasses RLS).
drop policy if exists worker_status_admin_read on public.worker_status;
create policy worker_status_admin_read on public.worker_status
  for select using (public.is_admin());

do $$ begin
  alter publication supabase_realtime add table public.worker_status;
exception when duplicate_object then null; end $$;
