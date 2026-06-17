import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Server } from 'lucide-react';
import { getBalanceModeStatus } from '@/lib/admin-actions';
import { getBalancedType } from '@/lib/balancer';

export const revalidate = 30; // Revalidate every 30 seconds

export default async function PublicServersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('servers');

  // We use admin client to fetch servers safely for public display
  const admin = createAdminClient();
  const { data: servers } = await admin
    .from('servers')
    .select('id, name, country, country_code, protocol, latency_ms, network_type')
    .eq('is_working', true)
    .eq('is_deleted', false)
    .order('network_type', { ascending: true })
    .order('latency_ms', { ascending: true, nullsFirst: false })
    .limit(1000);

  // Fetch accurate global counts independent of the 1000 limit display
  const [
    { count: geminiLteCount },
    { count: geminiWifiCount },
    { count: lteCount },
    { count: wifiCount },
    { count: whitelistCount },
    { count: geminiWhitelistCount }
  ] = await Promise.all([
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'gemini_lte'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'gemini_wifi'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'lte'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'wifi'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'whitelist'),
    admin.from('servers').select('*', { count: 'exact', head: true }).eq('is_working', true).eq('is_deleted', false).eq('network_type', 'gemini_whitelist'),
  ]);

  const balanceMode = await getBalanceModeStatus();

  let dispGeminiLte = geminiLteCount || 0;
  let dispGeminiWifi = geminiWifiCount || 0;
  let dispLte = lteCount || 0;
  let dispWifi = wifiCount || 0;
  let dispWhitelist = whitelistCount || 0;
  let dispGeminiWhitelist = geminiWhitelistCount || 0;

  if (balanceMode) {
    const poolWifi = dispGeminiWifi + dispWifi;
    dispWifi = Math.floor(poolWifi / 2);
    dispGeminiWifi = poolWifi - dispWifi;

    const poolLte = dispGeminiLte + dispLte;
    dispLte = Math.floor(poolLte / 2);
    dispGeminiLte = poolLte - dispLte;

    const poolWl = dispGeminiWhitelist + dispWhitelist;
    dispWhitelist = Math.floor(poolWl / 2);
    dispGeminiWhitelist = poolWl - dispWhitelist;

    if (servers) {
      servers.forEach(s => {
        s.network_type = getBalancedType(s.id, s.network_type);
      });
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 md:py-20 animate-fade-up">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl text-white">
          {t('title')}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-white/70">
          {t('description')}
        </p>
      </div>

      <div className="glass p-5 rounded-2xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-galaxy-accent/5 blur-3xl rounded-full" />
        
        <div className="relative mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-galaxy-accent/10 rounded-lg">
              <Server className="w-5 h-5 text-galaxy-accent" />
            </div>
            <h2 className="text-xl font-semibold">{t('title')}</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-fuchsia-500/50 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-300">✨ Gemini / LTE / Wi-Fi · {dispGeminiLte}</span>
            <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-300">✨ Gemini / Wi-Fi · {dispGeminiWifi}</span>
            <span className="rounded-md border border-fuchsia-300/40 bg-fuchsia-300/10 px-2 py-1 text-fuchsia-200">✨🛡️ Gemini / WhiteList · {dispGeminiWhitelist}</span>
            <span className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-white">🛡️ WhiteList / LTE / Wi-Fi · {dispWhitelist}</span>
            <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-300">📶 LTE / Wi-Fi · {dispLte}</span>
            <span className="rounded-md border border-galaxy-accent/40 bg-galaxy-accent/10 px-2 py-1 text-galaxy-accent">📡 Wi-Fi · {dispWifi}</span>
          </div>
        </div>

        {!servers || servers.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-white/40">
                <tr className="border-b border-white/10">
                  <th className="py-3 px-2 text-start font-semibold">{t('name')}</th>
                  <th className="py-3 px-2 text-start font-semibold">{t('network')}</th>
                  <th className="py-3 px-2 text-start font-semibold">{t('country')}</th>
                  <th className="py-3 px-2 text-start font-semibold">{t('protocol')}</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.id} className="border-t border-white/5 transition-colors hover:bg-white/[0.03]">
                    <td className="max-w-xs truncate py-3 px-2 font-medium">
                      {s.name.split(' | ')[0].replace(/^[\s\u{1F1E6}-\u{1F1FF}🌐🏳️]+/u, '').trim()}
                    </td>
                    <td className="py-3 px-2">
                      {s.network_type === 'gemini_lte' ? (
                        <span className="rounded bg-fuchsia-500/15 px-2 py-1 text-xs text-fuchsia-400">✨ Gemini / LTE / Wi-Fi</span>
                      ) : s.network_type === 'gemini_wifi' ? (
                        <span className="rounded bg-fuchsia-400/15 px-2 py-1 text-xs text-fuchsia-300">✨ Gemini / Wi-Fi</span>
                      ) : s.network_type === 'gemini_whitelist' ? (
                        <span className="rounded bg-fuchsia-300/15 px-2 py-1 text-xs text-fuchsia-200">✨🛡️ Gemini / WhiteList</span>
                      ) : s.network_type === 'whitelist' ? (
                        <span className="rounded bg-white/10 px-2 py-1 text-xs text-white">🛡️ WhiteList / LTE / Wi-Fi</span>
                      ) : s.network_type === 'lte' ? (
                        <span className="rounded bg-amber-400/15 px-2 py-1 text-xs text-amber-300">📶 LTE / Wi-Fi</span>
                      ) : (
                        <span className="rounded bg-galaxy-accent/15 px-2 py-1 text-xs text-galaxy-accent">📡 Wi-Fi</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
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
                    <td className="py-3 px-2 uppercase text-white/70 font-mono text-xs">{s.protocol ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
