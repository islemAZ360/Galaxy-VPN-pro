'use client';

import { useState } from 'react';
import { deleteSales } from '@/lib/admin-actions';
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
  salesRecord: any[];
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

export default function AdvancedStatsClient({ t, stats, byPlan, adv, salesRecord = [] }: AdvancedStatsClientProps) {
  const [resetting, setResetting] = useState(false);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSelectAll = () => {
    if (selectedSales.length === salesRecord.length && salesRecord.length > 0) {
      setSelectedSales([]);
    } else {
      setSelectedSales(salesRecord.map((s) => s.id));
    }
  };

  const toggleSale = (id: string) => {
    if (selectedSales.includes(id)) {
      setSelectedSales(selectedSales.filter((s) => s !== id));
    } else {
      setSelectedSales([...selectedSales, id]);
    }
  };

  const triggerDelete = () => {
    if (selectedSales.length === 0) return;
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    setResetting(true);
    try {
      await deleteSales(selectedSales);
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
    { label: t.mrr, value: `${adv.mrr} ₽`, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
    { label: t.arpu, value: `${adv.arpu} ₽`, icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
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
            <Zap className="h-5 w-5 text-amber-400" /> {t.networkDistribution}
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
            <ShieldAlert className="h-5 w-5 text-blue-400" /> {t.protocolAnalysis}
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
            <TrendingUp className="h-5 w-5 text-emerald-400" /> {t.revenueGrowth}
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
                  formatter={(value: any) => [`${value} ₽`, t.revenue]}
                />
                <Area type="monotone" dataKey="revenue_rub" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth */}
        <div className="admin-panel p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" /> {t.userGrowth}
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
                  formatter={(value: any) => [value, t.totalUsers]}
                />
                <Bar dataKey="new_users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4.5. AI Engine Analytics */}
      {adv.mlMetrics && adv.mlMetrics.length > 0 && (
        <div className="admin-panel p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" /> {t.aiEngineStats || 'AI Engine Analytics'}
              </h3>
              <p className="text-sm text-white/40 mt-1">{t.aiDesc || 'Continuous learning performance tracking for predictive filtering.'}</p>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-[0.65rem] uppercase tracking-wider text-white/40">{t.accuracy || 'Model Accuracy'}</div>
                <div className="text-xl font-bold text-yellow-400">
                  {Math.round(adv.mlMetrics[0].accuracy * 100)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[0.65rem] uppercase tracking-wider text-white/40">{t.datasetSize || 'Training Dataset'}</div>
                <div className="text-xl font-bold text-white/80">
                  {adv.mlMetrics[0].dataset_size}
                </div>
              </div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[...adv.mlMetrics].reverse()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#facc15" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#facc15" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="created_at" 
                  stroke="#64748b" 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  tickFormatter={(val) => new Date(val).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                />
                <YAxis domain={[0, 1]} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelFormatter={(val) => new Date(val).toLocaleString()}
                  formatter={(value: any) => [`${Math.round(value * 100)}%`, t.accuracy || 'Accuracy']}
                />
                <Area type="monotone" dataKey="accuracy" stroke="#facc15" strokeWidth={3} fillOpacity={1} fill="url(#colorAcc)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 5. Sales Record */}
      <div className="admin-panel p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-400" /> {t.salesRecordTitle || 'Sales Record'}
          </h3>
          {selectedSales.length > 0 && (
            <button 
              onClick={triggerDelete}
              disabled={resetting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition border border-red-500/30 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> {resetting ? t.resettingBtn : t.deleteSelected || 'Delete Selected'} ({selectedSales.length})
            </button>
          )}
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 border-b border-white/10 sticky top-0 bg-[#0f111a] z-10">
              <tr className="text-start">
                <th className="pb-3 px-2 text-start font-medium w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-white/20 bg-black/40 text-red-500 focus:ring-red-500/50 cursor-pointer" 
                    checked={salesRecord.length > 0 && selectedSales.length === salesRecord.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="pb-3 px-2 text-start font-medium">{t.date || 'Date'}</th>
                <th className="pb-3 px-2 text-start font-medium">Email</th>
                <th className="pb-3 px-2 text-center font-medium">{t.plan}</th>
                <th className="pb-3 px-2 text-end font-medium">{t.revenue}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {salesRecord.map((s) => (
                <tr key={s.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => toggleSale(s.id)}>
                  <td className="py-3 px-2">
                    <input 
                      type="checkbox" 
                      className="rounded border-white/20 bg-black/40 text-red-500 focus:ring-red-500/50 cursor-pointer pointer-events-none" 
                      checked={selectedSales.includes(s.id)}
                      readOnly
                    />
                  </td>
                  <td className="py-3 px-2 text-white/70 whitespace-nowrap">{new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-3 px-2 truncate max-w-[150px]">{s.users?.email || '—'}</td>
                  <td className="py-3 px-2 text-center">Plan {s.plan}</td>
                  <td className="py-3 px-2 text-end font-bold text-emerald-400">{s.amount_rub} ₽</td>
                </tr>
              ))}
              {salesRecord.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-white/40">
                    No sales found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Revenue By Plan Table */}
      <div className="admin-panel p-6">
        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-green-400" /> {t.revenueByPlan}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 border-b border-white/10">
              <tr className="text-start">
                <th className="pb-3 px-2 text-start font-medium">{t.plan}</th>
                <th className="pb-3 px-2 text-center font-medium">{t.sales}</th>
                <th className="pb-3 px-2 text-end font-medium">{t.revenue}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {byPlan.map((r, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-2 font-semibold">{t.plan} {r.plan}</td>
                  <td className="py-4 px-2 text-center text-lg">{r.sales}</td>
                  <td className="py-4 px-2 text-end font-bold text-emerald-400">{r.revenue_rub} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f111a] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-red-500/10 blur-3xl" />
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2 relative z-10">
              <ShieldAlert className="h-6 w-6 text-red-500" />
              {t.confirmTitle || 'Confirm Deletion'}
            </h3>
            <p className="text-white/70 mb-6 text-sm leading-relaxed relative z-10">
              {(t.confirmDesc || 'Are you sure you want to permanently delete the {count} selected sales records and their associated subscriptions? This action cannot be undone.').replace('{count}', String(selectedSales.length))}
            </p>
            <div className="flex justify-end gap-3 relative z-10">
              <button 
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg font-medium text-white/70 hover:bg-white/10 transition-colors"
              >
                {t.cancelBtn || 'Cancel'}
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
              >
                {t.deleteBtn || 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
