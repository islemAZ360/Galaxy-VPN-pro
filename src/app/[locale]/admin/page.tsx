import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { PLANS } from '@/lib/plans';
import { Users, CheckCircle, Server, CreditCard, Banknote, Clock, TrendingUp } from 'lucide-react';

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
    { label: t('totalUsers'), value: stats?.total_users ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
    { label: t('activeSubs'), value: stats?.active_subscriptions ?? 0, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
    { label: t('workingServers'), value: stats?.working_servers ?? 0, icon: Server, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
    { label: t('pendingPayments'), value: stats?.pending_payments ?? 0, icon: CreditCard, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
    { label: t('revenue'), value: `${stats?.total_revenue_rub ?? 0} ₽`, icon: Banknote, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
    {
      label: t('lastCheck'),
      value: stats?.last_check_at ? new Date(stats.last_check_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—',
      icon: Clock, color: 'text-galaxy-accent', bg: 'bg-galaxy-accent/10', border: 'border-galaxy-accent/20'
    },
  ];

  const totalSales = byPlan?.reduce((acc, r) => acc + (r.sales ?? 0), 0) || 1;

  return (
    <div className="space-y-8">
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={`card-lift rounded-2xl border ${c.border} bg-white/[0.02] p-5 shadow-lg relative overflow-hidden group`}>
            <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full ${c.bg} blur-2xl opacity-50 group-hover:opacity-100 transition-opacity`} />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-white/60">{c.label}</div>
                <div className="mt-2 text-3xl font-bold tracking-tight text-white/90">{c.value}</div>
              </div>
              <div className={`p-3 rounded-xl ${c.bg}`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass animate-fade-up rounded-2xl p-6 relative overflow-hidden" style={{ animationDelay: '0.32s' }}>
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-galaxy-accent/5 blur-3xl rounded-full" />
        
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-galaxy-accent/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-galaxy-accent" />
            </div>
            <h2 className="text-xl font-semibold">{t('revenueByPlan')}</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-white/50 border-b border-white/10">
                <tr className="text-start">
                  <th className="pb-3 px-2 text-start font-medium">{t('plan')}</th>
                  <th className="pb-3 px-2 text-center font-medium">{t('sales')}</th>
                  <th className="pb-3 px-2 text-start font-medium w-1/3"></th>
                  <th className="pb-3 px-2 text-end font-medium">{t('revenue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {PLANS.map((p) => {
                  const row = byPlan?.find((r) => r.plan === p.id);
                  const sales = row?.sales ?? 0;
                  const percentage = Math.round((sales / totalSales) * 100) || 0;
                  
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">#{p.id}</span>
                          <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/70 group-hover:bg-white/20 transition-colors">
                            {p.durationDays}d
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center text-lg font-medium">
                        {sales}
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
                            <div
                              className="h-full origin-left animate-grow-x rounded-full bg-gradient-to-r from-galaxy-accent to-cyan-300"
                              style={{ width: `${Math.max(percentage, 2)}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/50 w-8">{percentage}%</span>
                        </div>
                      </td>
                      <td className="py-4 px-2 text-end font-bold text-emerald-400">
                        {row?.revenue_rub ?? 0} ₽
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
