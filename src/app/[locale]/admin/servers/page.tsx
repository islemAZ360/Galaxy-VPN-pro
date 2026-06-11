import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { Trash2 } from 'lucide-react';
import { deleteServer, deleteAllServers } from './actions';

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

  const geminiCount = servers?.filter((s) => s.network_type === 'gemini').length ?? 0;
  const lteCount = servers?.filter((s) => s.network_type === 'lte').length ?? 0;
  const wifiCount = (servers?.length ?? 0) - lteCount - geminiCount;

  return (
    <div className="glass p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <div className="flex gap-2 text-xs">
          <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-300">✨ Gemini · {geminiCount}</span>
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-300">📶 LTE · {lteCount}</span>
          <span className="rounded-md border border-galaxy-accent/40 bg-galaxy-accent/10 px-2 py-1 text-galaxy-accent">📡 Wi-Fi · {wifiCount}</span>
          <form action={async () => {
            'use server';
            await deleteAllServers();
          }}>
            <button className="rounded-md border border-red-500/50 bg-red-500/20 px-2 py-1 text-red-400 hover:bg-red-500/30 transition">
              {t('delete_all', { fallback: 'Delete All' })}
            </button>
          </form>
        </div>
      </div>

      {!servers || servers.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/50">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="py-2 text-start">{t('name')}</th>
                <th className="py-2 text-start">{t('network')}</th>
                <th className="py-2 text-start">{t('country')}</th>
                <th className="py-2 text-start">{t('protocol')}</th>
                <th className="py-2 text-start">{t('latency')}</th>
                <th className="py-2 text-end"></th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="max-w-xs truncate py-2">
                    {s.name.split(' | ')[0].replace(/^[\s\u{1F1E6}-\u{1F1FF}🌐🏳️]+/u, '').trim()}
                  </td>
                  <td className="py-2">
                    {s.network_type === 'gemini' ? (
                      <span className="rounded bg-fuchsia-400/15 px-2 py-1 text-xs text-fuchsia-300">✨ WIFI / LTE / GEMINI</span>
                    ) : s.network_type === 'lte' ? (
                      <span className="rounded bg-amber-400/15 px-2 py-1 text-xs text-amber-300">📶 WIFI / LTE</span>
                    ) : (
                      <span className="rounded bg-galaxy-accent/15 px-2 py-1 text-xs text-galaxy-accent">📡 WIFI</span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {s.country_code && s.country_code.length === 2 ? (
                        <Image
                          src={`https://flagcdn.com/${s.country_code.toLowerCase()}.svg`}
                          alt={s.country_code}
                          width={20}
                          height={15}
                          className="rounded-[2px]"
                        />
                      ) : (
                        <span className="text-base">🏳️</span>
                      )}
                      <span>{s.country ?? '—'}</span>
                    </div>
                  </td>
                  <td className="py-2 uppercase text-white/70">{s.protocol ?? '—'}</td>
                  <td className="py-2 tabular-nums">{s.latency_ms != null ? `${s.latency_ms} ms` : '—'}</td>
                  <td className="py-2 text-end">
                    <form action={async () => {
                      'use server';
                      await deleteServer(s.id);
                    }}>
                      <button className="rounded p-1 text-red-400 hover:bg-red-400/10 transition" title={t('delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
