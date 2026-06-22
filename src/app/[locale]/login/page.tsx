import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { GoogleButton } from '@/components/GoogleButton';
import { SpaceBackground } from '@/components/SpaceBackground';
import { FadeIn } from '@/components/FadeIn';
import { Orbit, ShieldCheck, Zap, Globe } from 'lucide-react';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { redirect: nextRedirect } = require('next/navigation');
    nextRedirect(next || `/${locale}/profile`);
  }

  const t = await getTranslations('auth');

  return (
    <div className="relative flex min-h-[78vh] items-center justify-center px-4">
      <SpaceBackground />

      <FadeIn direction="up" className="relative z-10 w-full max-w-md">
        <div className="glass relative overflow-hidden rounded-3xl p-8 text-center shadow-2xl">
          {/* top brand glow */}
          <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-galaxy-accent/60 to-transparent" />

          {/* logo mark */}
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-galaxy-primary/30 to-galaxy-accent/20 shadow-[0_0_30px_rgba(124,58,237,0.35)]">
            <Orbit className="h-8 w-8 text-galaxy-accent animate-spin-slow" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-galaxy-accent to-violet-400 bg-clip-text text-transparent">Galaxy</span>VPN
          </h1>
          <p className="mt-1 text-base font-semibold text-white/90">{t('title')}</p>
          <p className="mt-2 text-sm text-white/60">{t('subtitle')}</p>

          <div className="mt-8">
            <GoogleButton label={t('google')} nextUrl={next} />
          </div>

          {/* trust strip */}
          <div className="mt-8 flex items-center justify-center gap-5 border-t border-white/10 pt-6 text-[11px] font-medium text-white/45">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" /> Encrypted</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-400/80" /> Fast</span>
            <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-galaxy-accent/80" /> Global</span>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
