import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[supa] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
}

// Service-role client: bypasses RLS. NEVER expose this key to the browser.
export const supa = createClient(url ?? '', serviceKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
