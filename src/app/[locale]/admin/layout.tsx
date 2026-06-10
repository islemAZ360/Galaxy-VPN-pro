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
      <h1 className="mb-5 text-3xl font-bold">{t('title')}</h1>
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
