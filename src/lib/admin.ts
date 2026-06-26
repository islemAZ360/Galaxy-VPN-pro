import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cache } from 'react';

const ADMIN_EMAIL = 'islamazaizia360@gmail.com';

// Defense-in-depth: verify the caller is the admin (in addition to the layout
// guard), then return a service-role client for admin data fetching.
export const requireAdmin = cache(async (locale: string) => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect({ href: '/login', locale });
  
  if (user.email === ADMIN_EMAIL) {
    return { admin: createAdminClient(), adminId: user.id };
  }
  
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') redirect({ href: '/', locale });
  return { admin: createAdminClient(), adminId: user.id };
});
