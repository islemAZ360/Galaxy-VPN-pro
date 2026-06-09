-- Run this once in Supabase → SQL Editor to close the admin-view leak.
-- (Also included in schema.sql section 13 for fresh setups.)
revoke all on public.admin_stats           from anon, authenticated;
revoke all on public.admin_revenue_by_plan from anon, authenticated;
alter view public.admin_stats           set (security_invoker = on);
alter view public.admin_revenue_by_plan set (security_invoker = on);
