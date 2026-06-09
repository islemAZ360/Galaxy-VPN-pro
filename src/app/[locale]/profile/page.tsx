import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { Link, redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { CountdownTimer } from '@/components/CountdownTimer';
import { SubLink } from '@/components/SubLink';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const t = await getTranslations('profile');

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let adminMessage: string | null = null;
  if (sub) {
    const { data: pay } = await supabase
      .from('payments')
      .select('admin_message')
      .eq('subscription_id', sub.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    adminMessage = pay?.admin_message ?? null;
  }

  const now = Date.now();
  const isActive = sub?.status === 'active' && sub.end_at && new Date(sub.end_at).getTime() > now;
  const isExpired =
    sub?.status === 'expired' ||
    (sub?.status === 'active' && sub.end_at && new Date(sub.end_at).getTime() <= now);

  // Derive the public base URL from the request so the sub link is always
  // correct in any environment (no build-time NEXT_PUBLIC_SITE_URL needed).
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? '');
  const subUrl = sub ? `${base}/api/sub/${sub.sub_token}` : '';

  return (
    <div className="mx-auto max-w-3xl pt-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <span className="text-sm text-white/60">{user!.email}</span>
      </div>

      {adminMessage && (
        <div className="mt-6 rounded-xl border border-galaxy-accent/40 bg-galaxy-accent/10 p-4">
          <div className="text-sm font-semibold text-galaxy-accent">{t('adminMessage')}</div>
          <p className="mt-1 text-sm text-white/80">{adminMessage}</p>
        </div>
      )}

      <div className="mt-6">
        {/* No subscription */}
        {!sub && (
          <div className="glass p-8 text-center">
            <p className="text-white/70">{t('noSub')}</p>
            <Link href="/#plans" className="mt-5 inline-block rounded-xl bg-galaxy-primary px-6 py-3 font-medium hover:opacity-90">
              {t('choosePlan')}
            </Link>
          </div>
        )}

        {/* Pending */}
        {sub?.status === 'pending' && (
          <div className="glass p-8 text-center">
            <div className="text-2xl">⏳</div>
            <h2 className="mt-3 text-xl font-semibold">{t('pendingTitle')}</h2>
            <p className="mt-2 text-white/70">{t('pendingDesc')}</p>
          </div>
        )}

        {/* Rejected */}
        {sub?.status === 'rejected' && (
          <div className="glass p-8 text-center">
            <div className="text-2xl">✖️</div>
            <h2 className="mt-3 text-xl font-semibold text-red-400">{t('rejectedTitle')}</h2>
            <p className="mt-2 text-white/70">{t('rejectedDesc')}</p>
            <Link href="/#plans" className="mt-5 inline-block rounded-xl bg-galaxy-primary px-6 py-3 font-medium hover:opacity-90">
              {t('choosePlan')}
            </Link>
          </div>
        )}

        {/* Active */}
        {isActive && (
          <div className="glass flex flex-col gap-6 p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <h2 className="text-xl font-semibold">{t('activeTitle')}</h2>
                </div>
                <p className="mt-1 text-sm text-white/60">{t('serversIncluded', { count: sub.server_count })}</p>
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm text-white/60">{t('remaining')}</div>
              <CountdownTimer endAt={sub.end_at as string} />
            </div>
            <SubLink url={subUrl} />
          </div>
        )}

        {/* Expired */}
        {isExpired && (
          <div className="glass p-8 text-center">
            <div className="text-2xl">⛔</div>
            <h2 className="mt-3 text-xl font-semibold">{t('expiredTitle')}</h2>
            <Link href="/#plans" className="mt-5 inline-block rounded-xl bg-galaxy-primary px-6 py-3 font-medium hover:opacity-90">
              {t('renew')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
