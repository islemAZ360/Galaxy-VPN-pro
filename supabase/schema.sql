-- ============================================================================
-- GalaxyVPN — Supabase schema
-- Run this file in: Supabase Dashboard → SQL Editor → New query → Run
-- It is idempotent-ish: safe to re-run during development.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role      as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sub_status     as enum ('pending', 'active', 'expired', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sender_type    as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. The admin email — anyone signing in with this Google account becomes admin
-- ----------------------------------------------------------------------------
create or replace function public.galaxy_admin_email()
returns text language sql immutable as $$
  select 'islamazaizia360@gmail.com'::text;
$$;

-- ----------------------------------------------------------------------------
-- 3. users (public profile mirror of auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  full_name     text,
  avatar_url    text,
  role          user_role not null default 'user',
  banned_until  timestamptz,
  created_at    timestamptz not null default now()
);

-- helper: is the current request an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. subscriptions
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  plan          int  not null check (plan between 1 and 4),
  server_count  int  not null,
  price_rub     int  not null,
  duration_days int  not null,
  status        sub_status not null default 'pending',
  start_at      timestamptz,
  end_at        timestamptz,
  sub_token     uuid not null unique default gen_random_uuid(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_subscriptions_user   on public.subscriptions(user_id);
create index if not exists idx_subscriptions_token  on public.subscriptions(sub_token);
create index if not exists idx_subscriptions_status on public.subscriptions(status);

-- ----------------------------------------------------------------------------
-- 5. payments (manual Sber Bank receipts, base64 image stored inline)
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan            int  not null,
  amount_rub      int  not null,
  receipt_base64  text not null,          -- compressed image, data URL or raw base64
  status          payment_status not null default 'pending',
  admin_message   text,
  reviewed_by     uuid references public.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_payments_user   on public.payments(user_id);
create index if not exists idx_payments_status on public.payments(status);

-- ----------------------------------------------------------------------------
-- 6. servers (the live pool — written by the Tester Worker via service_role)
-- ----------------------------------------------------------------------------
create table if not exists public.servers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  country         text,
  country_code    text,                   -- ISO-2, for flag rendering
  protocol        text,                   -- vless / vmess / trojan / ss
  config_uri      text not null,          -- vless://... full link
  config_hash     text not null unique,   -- dedupe key (hash of config_uri)
  latency_ms      int,
  is_working      boolean not null default true,
  source_repo     text,
  last_checked_at timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_servers_working on public.servers(is_working);
create index if not exists idx_servers_latency on public.servers(latency_ms);

-- ----------------------------------------------------------------------------
-- 7. repos (GitHub repo URLs the admin manages from the modified Hiddify app)
-- ----------------------------------------------------------------------------
create table if not exists public.repos (
  id         uuid primary key default gen_random_uuid(),
  repo_url   text not null unique,
  enabled    boolean not null default true,
  added_by   uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. support_messages (one thread per user; text + optional base64 image)
-- ----------------------------------------------------------------------------
create table if not exists public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade, -- the thread owner
  sender       sender_type not null,
  body         text,
  image_base64 text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_support_user on public.support_messages(user_id, created_at);

-- ----------------------------------------------------------------------------
-- 9. New-user trigger: mirror auth.users → public.users, auto-assign admin role
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    case when new.email = public.galaxy_admin_email() then 'admin'::user_role
         else 'user'::user_role end
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.users.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
        role       = case when excluded.email = public.galaxy_admin_email()
                          then 'admin'::user_role else public.users.role end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 10. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.users            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.payments         enable row level security;
alter table public.servers          enable row level security;
alter table public.repos            enable row level security;
alter table public.support_messages enable row level security;

-- users: self read/update; admin reads/updates all
drop policy if exists users_self_read   on public.users;
drop policy if exists users_self_update on public.users;
drop policy if exists users_admin_all   on public.users;
create policy users_self_read   on public.users for select using (auth.uid() = id);
create policy users_self_update on public.users for update using (auth.uid() = id);
create policy users_admin_all   on public.users for all    using (public.is_admin()) with check (public.is_admin());

-- subscriptions: owner read; admin all (inserts are now done exclusively via Server Actions to prevent Mass Assignment)
drop policy if exists subs_owner_read   on public.subscriptions;
drop policy if exists subs_owner_insert on public.subscriptions;
drop policy if exists subs_admin_all    on public.subscriptions;
create policy subs_owner_read   on public.subscriptions for select using (auth.uid() = user_id);
create policy subs_admin_all    on public.subscriptions for all    using (public.is_admin()) with check (public.is_admin());

-- payments: owner read; admin all (inserts are now done exclusively via Server Actions to prevent Mass Assignment)
drop policy if exists pay_owner_read   on public.payments;
drop policy if exists pay_owner_insert on public.payments;
drop policy if exists pay_admin_all    on public.payments;
create policy pay_owner_read   on public.payments for select using (auth.uid() = user_id);
create policy pay_admin_all    on public.payments for all    using (public.is_admin()) with check (public.is_admin());

-- servers: world-readable (for the public server list); only admin writes via UI.
-- The Tester Worker uses the service_role key which bypasses RLS entirely.
drop policy if exists servers_public_read on public.servers;
drop policy if exists servers_admin_write on public.servers;
create policy servers_public_read on public.servers for select using (true);
create policy servers_admin_write on public.servers for all using (public.is_admin()) with check (public.is_admin());

-- repos: admin only (read + write)
drop policy if exists repos_admin_all on public.repos;
create policy repos_admin_all on public.repos for all using (public.is_admin()) with check (public.is_admin());

-- support_messages: owner of the thread read/insert; admin all
drop policy if exists sup_owner_read   on public.support_messages;
drop policy if exists sup_owner_insert on public.support_messages;
drop policy if exists sup_admin_all    on public.support_messages;
create policy sup_owner_read   on public.support_messages for select using (auth.uid() = user_id);
create policy sup_owner_insert on public.support_messages for insert
  with check (auth.uid() = user_id and sender = 'user');
create policy sup_admin_all    on public.support_messages for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. Admin stats views
-- ----------------------------------------------------------------------------
create or replace view public.admin_stats as
  select
    (select count(*) from public.users)                                          as total_users,
    (select count(*) from public.subscriptions where status = 'active')          as active_subscriptions,
    (select count(*) from public.servers where is_working)                       as working_servers,
    (select max(last_checked_at) from public.servers)                            as last_check_at,
    (select coalesce(sum(amount_rub),0) from public.payments where status='approved') as total_revenue_rub,
    (select count(*) from public.payments where status = 'pending')              as pending_payments;

create or replace view public.admin_revenue_by_plan as
  select plan, count(*) as sales, coalesce(sum(amount_rub),0) as revenue_rub
  from public.payments where status = 'approved'
  group by plan order by plan;

-- ----------------------------------------------------------------------------
-- 12. Realtime: add tables to the supabase_realtime publication
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.support_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.servers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.subscriptions;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 13. Harden the admin views
-- Views bypass RLS (they run with the owner's rights), and Supabase grants
-- select to anon/authenticated by default — which would leak aggregate
-- business stats (user counts, revenue) to any logged-in client. Revoke that;
-- the admin dashboard reads these via the service_role key, which is unaffected.
-- ----------------------------------------------------------------------------
revoke all on public.admin_stats          from anon, authenticated;
revoke all on public.admin_revenue_by_plan from anon, authenticated;
alter view public.admin_stats           set (security_invoker = on);
alter view public.admin_revenue_by_plan set (security_invoker = on);

-- ============================================================================
-- Done.
-- ============================================================================
