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

  const { data: status } = await admin
    .from('worker_status')
    .select('state, last_seen, last_sync_at, last_result')
    .eq('id', 'worker')
    .maybeSingle();

  return (
    <div className="space-y-4">
      <WorkerStatus initial={status ?? null} />
      <RepoManager repos={repos ?? []} />
    </div>
  );
}
