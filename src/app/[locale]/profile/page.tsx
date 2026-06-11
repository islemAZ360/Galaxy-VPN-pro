import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CountdownTimer } from '@/components/CountdownTimer';
import { SubLink } from '@/components/SubLink';
import { PlanCard } from '@/components/PlanCard';
import { PLANS } from '@/lib/plans';

// per-user auth-gated page — never prerender at build
export const dynamic = 'force-dynamic';

function PlansGrid() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map((p) => (
        <PlanCard key={p.id} plan={p} featured={p.id === 3} />
      ))}
    </div>
  );
}

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

  const ADMIN_EMAIL = 'islamazaizia360@gmail.com';
  if (user!.email === ADMIN_EMAIL) redirect({ href: '/admin', locale });

  const t = await getTranslations('profile');

  // Fetch ALL subscriptions for the user
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const subsList = subs ?? [];

  // Fetch payments to get admin messages
  const { data: payments } = await supabase
    .from('payments')
    .select('subscription_id, admin_message')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const adminMessages = new Map<string, string>();
  for (const p of payments ?? []) {
    if (p.subscription_id && p.admin_message && !adminMessages.has(p.subscription_id)) {
      adminMessages.set(p.subscription_id, p.admin_message);
    }
  }

  // Fetch devices for all subscriptions
  const adminClient = createAdminClient();
  let allDevs: any[] = [];
  if (subsList.length > 0) {
    const subIds = subsList.map(s => s.id);
    const { data: devs } = await adminClient
      .from('sub_devices')
      .select('subscription_id, ip_address, device_type, last_seen_at')
      .in('subscription_id', subIds)
      .order('last_seen_at', { ascending: false });
    allDevs = devs ?? [];
  }

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? '');

  const now = Date.now();

  return (
    <div className="mx-auto max-w-3xl pt-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <span className="text-sm text-white/60">{user!.email}</span>
      </div>

      <div className="mt-8 space-y-8">
        {subsList.length === 0 && (
          <div className="glass p-6 text-center">
            <p className="text-white/70">{t('noSub')}</p>
          </div>
        )}

        {subsList.map((sub) => {
          const isActive = sub.status === 'active' && sub.end_at && new Date(sub.end_at).getTime() > now;
          const isExpired = sub.status === 'expired' || (sub.status === 'active' && sub.end_at && new Date(sub.end_at).getTime() <= now);
          const subUrl = `${base}/api/sub/${sub.sub_token}`;
          const adminMessage = adminMessages.get(sub.id);
          const devices = allDevs.filter(d => d.subscription_id === sub.id);

          return (
            <div key={sub.id} className="relative">
              {adminMessage && (
                <div className="mb-4 rounded-xl border border-galaxy-accent/40 bg-galaxy-accent/10 p-4">
                  <div className="text-sm font-semibold text-galaxy-accent">{t('adminMessage')}</div>
                  <p className="mt-1 text-sm text-white/80">{adminMessage}</p>
                </div>
              )}

              {/* Pending */}
              {sub.status === 'pending' && (
                <div className="glass p-8 text-center">
                  <div className="text-2xl">⏳</div>
                  <h2 className="mt-3 text-xl font-semibold">{t('pendingTitle')}</h2>
                  <p className="mt-2 text-white/70">{t('pendingDesc')}</p>
                </div>
              )}

              {/* Rejected */}
              {sub.status === 'rejected' && (
                <div className="glass p-8 text-center border border-red-500/30">
                  <div className="text-2xl">✖️</div>
                  <h2 className="mt-3 text-xl font-semibold text-red-400">{t('rejectedTitle')}</h2>
                  <p className="mt-2 text-white/70">{t('rejectedDesc')}</p>
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
                  
                  {devices.length > 0 && (
                    <div className="mt-4 border-t border-white/5 pt-6">
                      <h3 className="text-lg font-semibold mb-3">{t('connectedDevices')}</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {devices.map((d, i) => (
                          <div key={i} className="rounded-lg bg-white/5 p-4 border border-white/10 flex items-center justify-between">
                            <div>
                              <div className="font-medium text-galaxy-accent font-mono text-sm">{d.ip_address}</div>
                              <div className="text-xs text-white/50 mt-1">{d.device_type}</div>
                            </div>
                            <div className="text-xs text-white/40 text-right">
                              <div>{t('lastSeen')}</div>
                              <div>{new Date(d.last_seen_at).toLocaleDateString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Expired */}
              {isExpired && (
                <div className="glass p-8 text-center border border-white/10 opacity-75">
                  <div className="text-2xl">⛔</div>
                  <h2 className="mt-3 text-xl font-semibold">{t('expiredTitle')}</h2>
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-8 border-t border-white/10">
          <h2 className="text-2xl font-bold mb-2">
            {subsList.length > 0 ? (t('renew') || 'Renew / Add Subscription') : t('choosePlan')}
          </h2>
          <p className="text-white/60 mb-6">{t('buyNewSubDesc') || 'Choose a plan to get started.'}</p>
          <PlansGrid />
        </div>
      </div>
    </div>
  );
}
