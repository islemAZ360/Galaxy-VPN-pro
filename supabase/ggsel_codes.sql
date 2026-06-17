-- ===========================================================================
-- ggsel_codes — redeemable codes sold via GGSel (ggsel.com).
--
-- Each code is BOUND to a specific product = (plan, network_type). The admin
-- generates a batch per product, exports it as .txt, and uploads that file to
-- the MATCHING GGSel product. When a buyer redeems a code on our site, we accept
-- it ONLY if it matches the plan+network they selected — so a cheap code can
-- never activate a more expensive subscription (anti-fraud "matching" system).
--
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ===========================================================================
create table if not exists public.ggsel_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  plan         int  not null,                       -- plan id (1..4)
  network_type text not null,                        -- wifi | lte | gemini
  batch_id     uuid not null,                        -- one "Generate" click
  status       text not null default 'unused',       -- unused | redeemed
  redeemed_by  uuid references public.users(id) on delete set null,
  redeemed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists ggsel_codes_batch_idx  on public.ggsel_codes (batch_id);
create index if not exists ggsel_codes_status_idx on public.ggsel_codes (plan, network_type, status);

-- Per-batch summary for the admin "GGSel Codes" page (counts without pulling
-- thousands of rows to the client).
create or replace view public.ggsel_batches as
  select
    batch_id,
    plan,
    network_type,
    min(created_at)                                   as created_at,
    count(*)                                          as total,
    count(*) filter (where status = 'redeemed')       as redeemed
  from public.ggsel_codes
  group by batch_id, plan, network_type;

-- Service-role (admin client + server actions) bypasses RLS; enabling it with no
-- public policy means anon/auth users can never read or guess the codes.
alter table public.ggsel_codes enable row level security;
