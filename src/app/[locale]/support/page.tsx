import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { ChatThread } from '@/components/ChatThread';

// per-user auth-gated page — never prerender at build
export const dynamic = 'force-dynamic';

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const t = await getTranslations('support');

  return (
    <div className="mx-auto max-w-3xl pt-12">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <div className="glass mt-6 p-4">
        <ChatThread threadUserId={user!.id} sender="user" />
      </div>
    </div>
  );
}
