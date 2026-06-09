import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { PLANS } from '@/lib/plans';

export default async function AdminStatsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { admin } = await requireAdmin(locale);
  const t = await getTranslations('admin.stats');

  const { data: stats } = await admin.from('admin_stats').select('*').maybeSingle();
  const { data: byPlan } = await admin.from('admin_revenue_by_plan').select('*');

  const cards = [
    { label: t('totalUsers'), value: stats?.total_users ?? 0 },
    { label: t('activeSubs'), value: stats?.active_subscriptions ?? 0 },
    { label: t('workingServers'), value: stats?.working_servers ?? 0 },
    { label: t('pendingPayments'), value: stats?.pending_payments ?? 0 },
    { label: t('revenue'), value: `${stats?.total_revenue_rub ?? 0} ₽` },
    {
      label: t('lastCheck'),
      value: stats?.last_check_at ? new Date(stats.last_check_at).toLocaleString() : '—',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="glass p-5">
            <div className="text-sm text-white/60">{c.label}</div>
            <div className="mt-2 text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="glass p-5">
        <h2 className="mb-4 text-lg font-semibold">{t('revenueByPlan')}</h2>
        <table className="w-full text-sm">
          <thead className="text-white/50">
            <tr className="text-start">
              <th className="py-2 text-start">{t('plan')}</th>
              <th className="py-2 text-start">{t('sales')}</th>
              <th className="py-2 text-start">{t('revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((p) => {
              const row = byPlan?.find((r) => r.plan === p.id);
              return (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="py-2">#{p.id} · {p.durationDays}d</td>
                  <td className="py-2">{row?.sales ?? 0}</td>
                  <td className="py-2">{row?.revenue_rub ?? 0} ₽</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
