import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { GoogleButton } from '@/components/GoogleButton';

export default async function LoginPage({
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
  if (user) redirect({ href: '/profile', locale });

  const t = await getTranslations('auth');

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="glass w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-white/70">{t('subtitle')}</p>
        <div className="mt-8">
          <GoogleButton label={t('google')} />
        </div>
      </div>
    </div>
  );
}
