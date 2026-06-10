import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PLANS } from '@/lib/plans';
import { PlanCard } from '@/components/PlanCard';
import { FadeIn } from '@/components/FadeIn';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  const features = ['speed', 'global', 'share', 'privacy'] as const;

  return (
    <div className="flex flex-col gap-24 pt-16">
      {/* Hero */}
      <section className="relative text-center">
        {/* decorative space art */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden">
          {/* eslint-disable @next/next/no-img-element */}
          <img
            src="/planets/galaxy.png"
            alt=""
            className="animate-spin-slow absolute left-1/2 top-1/2 w-[680px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-40 blur-[1px]"
          />
          <img
            src="/planets/nebula_cloud.png"
            alt=""
            className="absolute -right-24 top-0 w-80 opacity-30 blur-sm"
          />
          {/* eslint-enable @next/next/no-img-element */}
        </div>

        <img
          aria-hidden
          src="/planets/astronaut.png"
          alt=""
          className="animate-float pointer-events-none absolute -top-4 end-0 hidden w-40 select-none drop-shadow-[0_0_30px_rgba(34,211,238,0.25)] lg:block"
        />
        <img
          aria-hidden
          src="/planets/planet_3.png"
          alt=""
          className="animate-float pointer-events-none absolute bottom-0 start-0 hidden w-28 select-none opacity-90 lg:block"
          style={{ animationDelay: '1.5s' }}
        />

        <FadeIn direction="up">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
            {t('heroTitle')}
          </h1>
        </FadeIn>
        <FadeIn direction="up" delay={0.2}>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">{t('heroSubtitle')}</p>
        </FadeIn>
        <FadeIn direction="up" delay={0.4}>
          <Link
            href="/#plans"
            className="mt-10 inline-block rounded-xl bg-galaxy-primary px-8 py-3 font-medium shadow-lg shadow-galaxy-primary/30 transition hover:opacity-90"
          >
            {t('cta')}
          </Link>
        </FadeIn>
      </section>

      {/* Features */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <FadeIn key={f} delay={i * 0.1} direction="up" className="h-full">
            <div className="glass p-6 h-full flex flex-col">
              <h3 className="text-lg font-semibold">{t(`features.${f}Title`)}</h3>
              <p className="mt-2 text-sm text-white/70 flex-grow">{t(`features.${f}Desc`)}</p>
            </div>
          </FadeIn>
        ))}
      </section>

      {/* Plans */}
      <section id="plans" className="scroll-mt-24">
        <FadeIn direction="up">
          <PlansHeader />
        </FadeIn>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Showcase only — the button sends visitors to sign in; the actual
              plan selection + payment happens in their account (profile). */}
          {PLANS.map((p, i) => (
            <FadeIn key={p.id} delay={i * 0.15} direction="up" className="h-full">
              <PlanCard plan={p} featured={p.id === 3} href="/login" />
            </FadeIn>
          ))}
        </div>
      </section>
    </div>
  );
}

async function PlansHeader() {
  const t = await getTranslations('plans');
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold">{t('title')}</h2>
      <p className="mt-3 text-white/70">{t('subtitle')}</p>
    </div>
  );
}
