import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { RepoManager } from '@/components/admin/RepoManager';

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

  return <RepoManager repos={repos ?? []} />;
}
