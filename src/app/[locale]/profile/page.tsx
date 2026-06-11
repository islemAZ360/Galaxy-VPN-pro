import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CountdownTimer } from '@/components/CountdownTimer';
import { SubLink } from '@/components/SubLink';
import { PlanCard } from '@/components/PlanCard';
import { PLANS } from '@/lib/plans';
import { ProfileRealtime } from '@/components/ProfileRealtime';

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
      <ProfileRealtime userId={user!.id} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-8 w-1 rounded-full bg-gradient-to-b from-galaxy-primary to-galaxy-accent" />
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 break-all sm:self-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {user!.email}
        </span>
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
                <div className="glass p-8 text-center relative">
                  <div className="absolute top-4 left-4 text-xs font-mono text-white/40">
                    {sub.network_type === 'gemini' ? '✨ Gemini (LTE & Wi-Fi)' : sub.network_type === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi'} • {t('serversIncluded', { count: sub.server_count })}
                  </div>
                  <div className="text-2xl mt-4">⏳</div>
                  <h2 className="mt-3 text-xl font-semibold">{t('pendingTitle')}</h2>
                  <p className="mt-2 text-white/70">{t('pendingDesc')}</p>
                </div>
              )}

              {/* Rejected */}
              {sub.status === 'rejected' && (
                <div className="glass p-8 text-center border border-red-500/30 relative">
                  <div className="absolute top-4 left-4 text-xs font-mono text-white/40">
                    {sub.network_type === 'gemini' ? '✨ Gemini (LTE & Wi-Fi)' : sub.network_type === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi'} • {t('serversIncluded', { count: sub.server_count })}
                  </div>
                  <div className="text-2xl mt-4">✖️</div>
                  <h2 className="mt-3 text-xl font-semibold text-red-400">{t('rejectedTitle')}</h2>
                  <p className="mt-2 text-white/70">{t('rejectedDesc')}</p>
                </div>
              )}

              {/* Active */}
              {isActive && (
                <div className="glass relative flex flex-col gap-6 overflow-hidden p-8">
                  <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
                  <div className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-emerald-400/80 to-galaxy-accent/40" />
                  <div className="relative flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
                        <h2 className="text-xl font-semibold">{t('activeTitle')}</h2>
                      </div>
                      <p className="mt-1 text-sm text-white/60">
                        <span className="text-galaxy-accent/80 font-medium mr-2">
                          {sub.network_type === 'gemini' ? '✨ Gemini (LTE & Wi-Fi)' : sub.network_type === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi'}
                        </span>
                        • {t('serversIncluded', { count: sub.server_count })}
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-sm text-white/60">{t('remaining')}</div>
                    <CountdownTimer endAt={sub.end_at as string} />
                  </div>
                  <SubLink url={subUrl} />
                  
                  <div className="mt-4 border-t border-white/5 pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">{t('connectedDevices')}</h3>
                      <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/60">
                        {devices.length} {t('devicesCount')}
                      </span>
                    </div>
                    {devices.length === 0 ? (
                      <div className="rounded-lg border border-white/5 bg-white/5 p-4 text-center text-sm text-white/50">
                        {t('noDevices') || 'No devices connected yet.'}
                      </div>
                    ) : (
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
                    )}
                  </div>
                </div>
              )}

              {/* Expired */}
              {isExpired && (
                <div className="glass p-8 text-center border border-white/10 opacity-75 relative">
                  <div className="absolute top-4 left-4 text-xs font-mono text-white/40">
                    {sub.network_type === 'gemini' ? '✨ Gemini (LTE & Wi-Fi)' : sub.network_type === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi'} • {t('serversIncluded', { count: sub.server_count })}
                  </div>
                  <div className="text-2xl mt-4">⛔</div>
                  <h2 className="mt-3 text-xl font-semibold">{t('expiredTitle')}</h2>
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-8 border-t border-white/10">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-galaxy-primary">{t('choosePlan')}</p>
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
