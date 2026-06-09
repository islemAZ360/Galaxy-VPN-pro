import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';

function flag(cc?: string | null) {
  if (!cc || cc.length !== 2) return '🏳️';
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

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
    .select('id, name, country, country_code, protocol, latency_ms')
    .eq('is_working', true)
    .order('latency_ms', { ascending: true, nullsFirst: false })
    .limit(1000);

  return (
    <div className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <span className="text-sm text-white/60">{servers?.length ?? 0}</span>
      </div>

      {!servers || servers.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/50">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="py-2 text-start">{t('name')}</th>
                <th className="py-2 text-start">{t('country')}</th>
                <th className="py-2 text-start">{t('protocol')}</th>
                <th className="py-2 text-start">{t('latency')}</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="max-w-xs truncate py-2">{s.name}</td>
                  <td className="py-2">
                    <span className="me-1">{flag(s.country_code)}</span>
                    {s.country ?? '—'}
                  </td>
                  <td className="py-2 uppercase text-white/70">{s.protocol ?? '—'}</td>
                  <td className="py-2 tabular-nums">{s.latency_ms != null ? `${s.latency_ms} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
