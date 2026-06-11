import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AdminTabs } from '@/components/admin/AdminTabs';
import { requireAdmin } from '@/lib/admin';

// admin area is per-user auth-gated — force dynamic for all nested pages
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireAdmin(locale);

  const t = await getTranslations('admin');

  return (
    <div className="pt-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="h-8 w-1 rounded-full bg-gradient-to-b from-galaxy-primary to-galaxy-accent" />
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      </div>
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
