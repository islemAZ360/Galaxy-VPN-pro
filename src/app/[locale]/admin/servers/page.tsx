import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { Trash2, Server } from 'lucide-react';
import { deleteServer, deleteAllServers } from './actions';
import { TestLatencyButton } from '@/components/admin/TestLatencyButton';
import { BalanceToggle } from '@/components/admin/BalanceToggle';
import { getBalanceModeStatus } from '@/lib/admin-actions';
import { getBalancedType } from '@/lib/balancer';

// Network-tier badge styling, shared by the header chips and the table rows.
const NET: Record<string, { label: string; cls: string }> = {
  gemini_lte: { label: '✨ Gemini / LTE / Wi-Fi', cls: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300' },
  gemini_wifi: { label: '✨ Gemini / Wi-Fi', cls: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300' },
  lte: { label: '📶 LTE / Wi-Fi', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  wifi: { label: '📡 Wi-Fi', cls: 'border-galaxy-accent/30 bg-galaxy-accent/10 text-galaxy-accent' },
};
const netBadge = (type: string) => NET[type] ?? NET.wifi;
// Latency → color (green fast · amber ok · red slow).
const latencyTone = (ms: number | null) =>
  ms == null ? { cls: 'text-white/35', dot: 'bg-white/30' }
    : ms < 300 ? { cls: 'text-emerald-300', dot: 'bg-emerald-400' }
      : ms < 1000 ? { cls: 'text-amber-300', dot: 'bg-amber-400' }
        : { cls: 'text-red-300', dot: 'bg-red-400' };

export default async function AdminServersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { admin } = await requireAdmin(locale);
  const t = await getTranslations('admin.servers');

  const { data: servers } = await admin
    .from('servers')
    .select('id, name, country, country_code, protocol, latency_ms, network_type')
    // premium first: 'gemini' < 'lte' < 'wifi' alphabetically, so ascending lists
    // gemini → lte → wifi; then by latency
    .eq('is_working', true)
    .eq('is_deleted', false)
    .order('network_type', { ascending: true })
    .order('latency_ms', { ascending: true, nullsFirst: false })
    .limit(1000);

  const { data: status } = await admin
    .from('worker_status')
    .select('last_seen, state')
    .eq('id', 'worker')
    .single();

  const [
    { count: geminiLteCount },
    { count: geminiWifiCount },
    { count: lteCount },
    { count: wifiCount }
  ] = await Promise.all([
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'gemini_lte'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'gemini_wifi'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'lte'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'wifi'),
  ]);

  const balanceMode = await getBalanceModeStatus();

  let dispGeminiLte = geminiLteCount || 0;
  let dispGeminiWifi = geminiWifiCount || 0;
  let dispLte = lteCount || 0;
  let dispWifi = wifiCount || 0;

  if (balanceMode) {
    const poolWifi = dispGeminiWifi + dispWifi;
    dispWifi = Math.floor(poolWifi / 2);
    dispGeminiWifi = poolWifi - dispWifi;

    const poolLte = dispGeminiLte + dispLte;
    dispLte = Math.floor(poolLte / 2);
    dispGeminiLte = poolLte - dispLte;

    if (servers) {
      servers.forEach(s => {
        s.network_type = getBalancedType(s.id, s.network_type);
      });
    }
  }

  const tiers = [
    ['gemini_lte', dispGeminiLte],
    ['gemini_wifi', dispGeminiWifi],
    ['lte', dispLte],
    ['wifi', dispWifi],
  ] as const;

  return (
    <div className="admin-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white/55">
            {(servers?.length ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <BalanceToggle initialEnabled={balanceMode} />
          {tiers.map(([type, n]) => {
            const b = netBadge(type);
            return (
              <span key={type} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium ${b.cls}`}>
                {b.label}
                <span className="rounded bg-black/25 px-1.5 tabular-nums">{n}</span>
              </span>
            );
          })}
          <TestLatencyButton label={t('test_latency', { fallback: 'Test Latency' })} />
          <form action={async () => {
            'use server';
            await deleteAllServers();
          }}>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-medium text-red-300 transition hover:bg-red-500/20">
              <Trash2 className="h-3.5 w-3.5" />
              {t('delete_all', { fallback: 'Delete All' })}
            </button>
          </form>
        </div>
      </div>

      {!servers || servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Server className="h-8 w-8 text-white/20" />
          <p className="text-sm text-white/45">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{t('name')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('network')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('country')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('protocol')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('latency')}</th>
                <th className="px-4 py-3 text-end"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {servers.map((s) => {
                const b = netBadge(s.network_type);
                const lat = latencyTone(s.latency_ms);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="max-w-xs truncate px-4 py-2.5 font-medium text-white/90">
                      {s.name.split(' | ')[0].replace(/^[\s\u{1F1E6}-\u{1F1FF}🌐🏳️]+/u, '').trim()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${b.cls}`}>{b.label}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {s.country_code && s.country_code.length === 2 ? (
                          <Image
                            src={`https://flagcdn.com/${s.country_code.toLowerCase()}.svg`}
                            alt={s.country_code}
                            width={20}
                            height={15}
                            className="rounded-[2px] ring-1 ring-white/10"
                          />
                        ) : (
                          <span className="text-base">🏳️</span>
                        )}
                        <span className="text-white/80">{s.country ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium uppercase text-white/55">{s.protocol ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 tabular-nums ${lat.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${lat.dot}`} />
                        {s.latency_ms != null ? `${s.latency_ms} ms` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <form action={async () => {
                        'use server';
                        await deleteServer(s.id);
                      }}>
                        <button className="rounded-lg p-1.5 text-red-400 opacity-60 transition hover:bg-red-400/10 hover:opacity-100" title={t('delete')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
