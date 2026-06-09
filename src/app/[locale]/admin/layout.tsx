import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { AdminTabs } from '@/components/admin/AdminTabs';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // guard: admin only
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const { data: me } = await supabase.from('users').select('role').eq('id', user!.id).maybeSingle();
  if (me?.role !== 'admin') redirect({ href: '/', locale });

  const t = await getTranslations('admin');

  return (
    <div className="pt-10">
      <h1 className="mb-5 text-3xl font-bold">{t('title')}</h1>
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
