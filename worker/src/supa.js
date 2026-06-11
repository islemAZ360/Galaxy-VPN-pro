import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[supa] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
}

// Custom fetch to disable Keep-Alive. 
// When you switch from Wi-Fi to LTE, Node's connection pool keeps dead sockets open, 
// causing "TypeError: terminated" when it tries to use them. Forcing close prevents this.
const customFetch = (url, options) => {
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'Connection': 'close',
    },
  });
};

// Service-role client: bypasses RLS. NEVER expose this key to the browser.
export const supa = createClient(url ?? '', serviceKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: customFetch },
});
