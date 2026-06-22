import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import AdvancedStatsClient from '@/components/admin/AdvancedStatsClient';

export default async function AdminStatsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { admin } = await requireAdmin(locale);
  const t = await getTranslations('admin.stats');

  // 1. Fetch Basic Stats (from views)
  const { data: stats } = await admin.from('admin_stats').select('*').maybeSingle();
  const { data: byPlan } = await admin.from('admin_revenue_by_plan').select('*');

  // 2. Fetch Raw Data for Advanced Analytics
  const { data: subs } = await admin.from('subscriptions').select('status, network_type, price_rub, duration_days').eq('status', 'active');
  const { data: servers } = await admin.from('servers').select('protocol, is_working, latency_ms').eq('is_working', true);
  const { data: uniquePaidUsers } = await admin.from('payments').select('user_id').eq('status', 'approved');
  const { data: salesRecord } = await admin.from('payments')
    .select('id, amount_rub, plan, created_at, user_id, users!payments_user_id_fkey(email)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(500);
  
  // 3. Fetch Time-Series Data (Last 30 Days)
  const { data: revenueByDay } = await admin.from('admin_revenue_by_day').select('*');
  const { data: usersByDay } = await admin.from('admin_users_by_day').select('*');

  // 3. Compute MRR (Monthly Recurring Revenue)
  let mrr = 0;
  subs?.forEach((sub) => {
    if (sub.duration_days > 0 && sub.price_rub > 0) {
      mrr += (sub.price_rub / sub.duration_days) * 30;
    }
  });
  
  // 4. Compute ARPU (Average Revenue per User)
  const totalRevenue = stats?.total_revenue_rub || 0;
  const uniqueUsersCount = new Set(uniquePaidUsers?.map((p) => p.user_id)).size;
  const arpu = uniqueUsersCount > 0 ? totalRevenue / uniqueUsersCount : 0;

  // 5. Network Distribution
  const networks = [
    { name: 'LTE', value: subs?.filter(s => s.network_type === 'lte').length || 0, color: '#f59e0b' },
    { name: 'Wi-Fi', value: subs?.filter(s => s.network_type === 'wifi').length || 0, color: '#06b6d4' },
    { name: 'Gemini', value: subs?.filter(s => s.network_type === 'gemini').length || 0, color: '#ec4899' },
  ].filter(n => n.value > 0);
  if (networks.length === 0) networks.push({ name: 'LTE', value: 1, color: '#334155' }); // fallback for empty pie

  // 6. Protocol Breakdown
  const protocolCount: Record<string, number> = {};
  let totalLatency = 0;
  let latencyCount = 0;
  servers?.forEach(s => {
    const p = (s.protocol || 'unknown').toLowerCase();
    protocolCount[p] = (protocolCount[p] || 0) + 1;
    if (s.latency_ms) {
      totalLatency += s.latency_ms;
      latencyCount++;
    }
  });
  const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
  
  const protocols = Object.entries(protocolCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
      color: ['vless', 'reality'].includes(name) ? '#3b82f6' : 
             name === 'trojan' ? '#8b5cf6' : 
             name === 'vmess' ? '#10b981' : '#64748b'
    }));

  const advancedData = {
    mrr: Math.round(mrr),
    arpu: Math.round(arpu),
    avgLatency,
    protocols,
    networks,
    revenueByDay: revenueByDay || [],
    usersByDay: usersByDay || [],
  };

  const translations = {
    totalUsers: t('totalUsers'),
    activeSubs: t('activeSubs'),
    workingServers: t('workingServers'),
    revenue: t('revenue'),
    pendingPayments: t('pendingPayments'),
    lastCheck: t('lastCheck'),
    revenueByPlan: t('revenueByPlan'),
    plan: t('plan'),
    sales: t('sales'),
    mrr: t('mrr'),
    arpu: t('arpu'),
    networkDistribution: t('networkDistribution'),
    protocolAnalysis: t('protocolAnalysis'),
    revenueGrowth: t('revenueGrowth'),
    userGrowth: t('userGrowth'),
    dangerZone: t('dangerZone'),
    dangerZoneDesc: t('dangerZoneDesc'),
    resetTestBtn: t('resetTestBtn'),
    resettingBtn: t('resettingBtn'),
    resetConfirm: t('resetConfirm', { fallback: 'Are you sure you want to delete your test data? This action cannot be undone.' }),
    confirmTitle: t('confirmTitle', { fallback: 'Confirm Deletion' }),
    confirmDesc: t('confirmDesc', { count: '{count}', fallback: 'Are you sure you want to permanently delete the {count} selected sales records and their associated subscriptions? This action cannot be undone.' }),
    cancelBtn: t('cancelBtn', { fallback: 'Cancel' }),
    deleteBtn: t('deleteBtn', { fallback: 'Yes, Delete' }),
  };

  return (
    <AdvancedStatsClient 
      t={translations} 
      stats={stats} 
      byPlan={byPlan || []} 
      adv={advancedData} 
      salesRecord={salesRecord || []}
    />
  );
}
