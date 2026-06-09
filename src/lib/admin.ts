import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Defense-in-depth: verify the caller is the admin (in addition to the layout
// guard), then return a service-role client for admin data fetching.
export async function requireAdmin(locale: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const { data: me } = await supabase.from('users').select('role').eq('id', user!.id).maybeSingle();
  if (me?.role !== 'admin') redirect({ href: '/', locale });
  return { admin: createAdminClient(), adminId: user!.id };
}
