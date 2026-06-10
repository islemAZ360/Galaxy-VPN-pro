-- Run in Supabase SQL Editor. Safe to re-run.
-- Lets the admin trigger a sync from the website; the local Tester Worker
-- subscribes to inserts here via Supabase Realtime and runs runSync().

create table if not exists public.sync_requests (
  id            uuid primary key default gen_random_uuid(),
  requested_by  uuid references public.users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  processed_at  timestamptz,
  result        jsonb
);
create index if not exists idx_sync_requests_pending
  on public.sync_requests(processed_at) where processed_at is null;

alter table public.sync_requests enable row level security;

drop policy if exists sync_req_admin_all on public.sync_requests;
create policy sync_req_admin_all on public.sync_requests
  for all using (public.is_admin()) with check (public.is_admin());

do $$ begin
  alter publication supabase_realtime add table public.sync_requests;
exception when duplicate_object then null; end $$;
