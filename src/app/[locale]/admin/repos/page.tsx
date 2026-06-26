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

  const [
    { data: repos },
    { data: repoStats },
    { data: status },
    { data: scanHistory }
  ] = await Promise.all([
    admin
      .from('repos')
      .select('id, repo_url, enabled, is_banned')
      .order('created_at', { ascending: true }),
    admin
      .from('repo_stats')
      .select('repo_url, files_found, configs_extracted, configs_working, wifi_count, lte_count, gemini_count, gemini_wifi_count, gemini_lte_count, last_sync_at'),
    admin
      .from('worker_status')
      .select('id, state, last_seen, last_sync_at, last_result')
      .eq('id', 'worker')
      .maybeSingle(),
    admin
      .from('sync_requests')
      .select('id, kind, requested_at, processed_at, result')
      .order('requested_at', { ascending: false })
      .limit(50)
  ]);

  return (
    <div className="space-y-4">
      <WorkerStatus initial={status ?? null} />
      <RepoManager repos={repos ?? []} repoStats={repoStats ?? []} scanHistory={scanHistory ?? []} />
    </div>
  );
}

