import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { RotateCcw, Trash2 } from 'lucide-react';
import { restoreServer } from '../actions';

// Deleted rows may carry legacy network tags (gemini / lte / wifi).
const NET: Record<string, { label: string; cls: string }> = {
  gemini: { label: '✨ Wi-Fi / LTE / Gemini', cls: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300' },
  lte: { label: '📶 Wi-Fi / LTE', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  wifi: { label: '📡 Wi-Fi', cls: 'border-galaxy-accent/30 bg-galaxy-accent/10 text-galaxy-accent' },
};
const netBadge = (type: string) => NET[type] ?? NET.wifi;
const latencyTone = (ms: number | null) =>
  ms == null ? { cls: 'text-white/35', dot: 'bg-white/30' }
    : ms < 300 ? { cls: 'text-emerald-300', dot: 'bg-emerald-400' }
      : ms < 1000 ? { cls: 'text-amber-300', dot: 'bg-amber-400' }
        : { cls: 'text-red-300', dot: 'bg-red-400' };

export default async function AdminDeletedServersPage({
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
    .eq('is_deleted', true)
    .order('network_type', { ascending: true })
    .order('latency_ms', { ascending: true, nullsFirst: false })
    .limit(1000);

  const geminiCount = servers?.filter((s) => s.network_type === 'gemini').length ?? 0;
  const lteCount = servers?.filter((s) => s.network_type === 'lte').length ?? 0;
  const wifiCount = (servers?.length ?? 0) - lteCount - geminiCount;
  const chips = [['gemini', geminiCount], ['lte', lteCount], ['wifi', wifiCount]] as const;

  return (
    <div className="admin-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold">{t('deleted_title', { fallback: 'Deleted Servers' })}</h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white/55">
            {(servers?.length ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {chips.map(([type, n]) => {
            const b = netBadge(type);
            return (
              <span key={type} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium ${b.cls}`}>
                {b.label}
                <span className="rounded bg-black/25 px-1.5 tabular-nums">{n}</span>
              </span>
            );
          })}
        </div>
      </div>

      {!servers || servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Trash2 className="h-8 w-8 text-white/20" />
          <p className="text-sm text-white/45">{t('empty_deleted', { fallback: 'No deleted servers found.' })}</p>
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
                  <tr key={s.id} className="opacity-70 transition-all hover:bg-white/[0.03] hover:opacity-100">
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
                        await restoreServer(s.id);
                      }}>
                        <button className="rounded-lg p-1.5 text-emerald-400 opacity-70 transition hover:bg-emerald-400/10 hover:opacity-100" title={t('restore', { fallback: 'Restore' })}>
                          <RotateCcw className="h-4 w-4" />
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
