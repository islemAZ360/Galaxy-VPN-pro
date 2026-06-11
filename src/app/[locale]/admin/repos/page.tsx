import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { RepoManager } from '@/components/admin/RepoManager';
import { WorkerStatus } from '@/components/admin/WorkerStatus';

export const dynamic = 'force-dynamic';

export default async function AdminReposPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { admin } = await requireAdmin(locale);

  const { data: repos } = await admin
    .from('repos')
    .select('id, repo_url, enabled')
    .order('created_at', { ascending: true });

  const { data: repoStats } = await admin
    .from('repo_stats')
    .select('repo_url, files_found, configs_extracted, configs_working, wifi_count, lte_count, gemini_count, last_sync_at');

  const { data: status } = await admin
    .from('worker_status')
    .select('state, last_seen, last_sync_at, last_result')
    .eq('id', 'worker')
    .maybeSingle();

  const { data: scanHistory } = await admin
    .from('sync_requests')
    .select('id, kind, requested_at, processed_at, result')
    .order('requested_at', { ascending: false })
    .limit(50);

  const { data: servers } = await admin
    .from('servers')
    .select('source_repo, network_type')
    .eq('is_working', true)
    .eq('is_deleted', false);

  const liveByRepo = new Map<string, { geminiLte: number, geminiWifi: number, lte: number, wifi: number }>();
  for (const s of servers ?? []) {
    if (!s.source_repo) continue;
    if (!liveByRepo.has(s.source_repo)) {
      liveByRepo.set(s.source_repo, { geminiLte: 0, geminiWifi: 0, lte: 0, wifi: 0 });
    }
    const counts = liveByRepo.get(s.source_repo)!;
    if (s.network_type === 'gemini_lte') counts.geminiLte++;
    else if (s.network_type === 'gemini_wifi') counts.geminiWifi++;
    else if (s.network_type === 'lte') counts.lte++;
    else if (s.network_type === 'wifi') counts.wifi++;
  }

  const enrichedRepoStats = (repoStats ?? []).map((rs) => {
    const counts = liveByRepo.get(rs.repo_url) ?? { geminiLte: 0, geminiWifi: 0, lte: 0, wifi: 0 };
    return {
      ...rs,
      gemini_lte_count: counts.geminiLte,
      gemini_wifi_count: counts.geminiWifi,
      lte_count: counts.lte,
      wifi_count: counts.wifi,
    };
  });

  return (
    <div className="space-y-4">
      <WorkerStatus initial={status ?? null} />
      <RepoManager repos={repos ?? []} repoStats={enrichedRepoStats} scanHistory={scanHistory ?? []} />
    </div>
  );
}

