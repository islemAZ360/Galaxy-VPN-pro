'use client';

import { useState } from 'react';
import { resetTestStats } from '@/lib/admin-actions';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie, Sector, AreaChart, Area, CartesianGrid 
} from 'recharts';
import { 
  Users, CheckCircle, Server, CreditCard, Banknote, Clock, TrendingUp, 
  Activity, Zap, ShieldAlert, Trash2
} from 'lucide-react';

interface AdvancedStatsClientProps {
  t: Record<string, string>;
  stats: any;
  byPlan: any[];
  adv: {
    mrr: number;
    arpu: number;
    avgLatency: number;
    protocols: { name: string; value: number; color: string }[];
    networks: { name: string; value: number; color: string }[];
    revenueByDay: { day: string; revenue_rub: number; sales: number }[];
    usersByDay: { day: string; new_users: number }[];
  };
}

const COLORS = {
  vless: '#3b82f6',
  trojan: '#8b5cf6',
  vmess: '#10b981',
  other: '#64748b',
  lte: '#f59e0b',
  wifi: '#06b6d4',
  gemini: '#ec4899',
};

export default function AdvancedStatsClient({ t, stats, byPlan, adv }: AdvancedStatsClientProps) {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!confirm(t.resetConfirm)) return;
    setResetting(true);
    try {
      await resetTestStats();
      window.location.reload();
    } catch (e) {
      console.error(e);
      setResetting(false);
    }
  };

  const cards = [
    { label: t.totalUsers, value: stats?.total_users ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
    { label: t.activeSubs, value: stats?.active_subscriptions ?? 0, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
    { label: t.workingServers, value: stats?.working_servers ?? 0, icon: Server, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
    { label: t.revenue, value: `${stats?.total_revenue_rub ?? 0} ₽`, icon: Banknote, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
    { label: 'MRR (العائد الشهري المتوقع)', value: `${adv.mrr} ₽`, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
    { label: 'ARPU (متوسط الدخل لكل مستخدم)', value: `${adv.arpu} ₽`, icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. KPIs Section */}
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="stat-card group">
            <div className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full ${c.bg} opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-90`} />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-white/45">{c.label}</div>
                <div className="text-gradient mt-2.5 truncate text-3xl font-bold tracking-tight">{c.value}</div>
              </div>
              <div className={`shrink-0 rounded-xl border ${c.border} ${c.bg} p-3 shadow-inner transition-transform duration-500 group-hover:scale-110`}>
                <c.icon className={`h-5 w-5 ${c.color}`} strokeWidth={2.2} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. Network Distribution Chart */}
        <div className="admin-panel p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" /> توزيع باقات الاشتراكات
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={adv.networks} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {adv.networks.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {adv.networks.map((n) => (
              <div key={n.name} className="flex items-center gap-2 text-sm text-white/70">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: n.color }} /> {n.name.toUpperCase()} ({n.value})
              </div>
            ))}
          </div>
        </div>

        {/* 3. Server Protocols Chart */}
        <div className="admin-panel p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-400" /> تحليل قوة السيرفرات (البروتوكولات)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adv.protocols} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#1e293b', opacity: 0.5 }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {adv.protocols.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
      </div>

      {/* 4. Time-Series Analytics (Revenue & Users) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Growth */}
        <div className="admin-panel p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" /> نمو الإيرادات (آخر 30 يوماً)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={adv.revenueByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  stroke="#64748b" 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelFormatter={(val) => new Date(val).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                  formatter={(value: any) => [`${value} ₽`, 'الإيرادات']}
                />
                <Area type="monotone" dataKey="revenue_rub" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth */}
        <div className="admin-panel p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" /> نمو المستخدمين الجدد (آخر 30 يوماً)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adv.usersByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  stroke="#64748b" 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: '#1e293b', opacity: 0.5 }} 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelFormatter={(val) => new Date(val).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                  formatter={(value: any) => [value, 'مستخدم جديد']}
                />
                <Bar dataKey="new_users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Danger Zone */}
      <div className="admin-panel border-red-500/20 bg-red-500/5 p-6 relative overflow-hidden">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
        <div className="relative">
          <h3 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> منطقة الإدارة المتقدمة (Danger Zone)
          </h3>
          <p className="text-sm text-red-300/70 mb-6 max-w-2xl">
            هل تقوم بتجارب إنشاء حسابات وشراء باقات وتُريد مسحها لأنها تؤثر على الإحصائيات الحقيقية؟ 
            هذا الزر سيقوم بحذف **جميع المدفوعات والاشتراكات** التي أنشأتها أنت (حساب الأدمن) لتعود الإحصائيات دقيقة جداً. لن يمس هذا الزر بيانات المشتركين الحقيقيين.
          </p>
          <button 
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-500/20 text-red-400 font-medium hover:bg-red-500/30 transition border border-red-500/30 disabled:opacity-50"
          >
            {resetting ? 'جارٍ التصفير...' : 'تصفير تجارب الأدمن (Reset My Test Data)'}
          </button>
        </div>
      </div>

      {/* 5. Revenue By Plan Table */}
      <div className="admin-panel p-6">
        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-green-400" /> الإيرادات حسب الاشتراك
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 border-b border-white/10">
              <tr className="text-start">
                <th className="pb-3 px-2 text-start font-medium">الاشتراك</th>
                <th className="pb-3 px-2 text-center font-medium">المبيعات</th>
                <th className="pb-3 px-2 text-end font-medium">الإيرادات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {byPlan.map((r, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-2 font-semibold">خطة رقم {r.plan}</td>
                  <td className="py-4 px-2 text-center text-lg">{r.sales}</td>
                  <td className="py-4 px-2 text-end font-bold text-emerald-400">{r.revenue_rub} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
