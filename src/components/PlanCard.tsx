'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { Plan } from '@/lib/plans';

// Customer-facing card: shows BOTH network variants side by side so the user
// picks the right one. `href` lets the home page point to /login instead of
// straight to checkout (showcase mode).
export function PlanCard({
  plan,
  featured,
  href,
}: {
  plan: Plan;
  featured?: boolean;
  href?: string;
}) {
  const t = useTranslations('plans');

  const LABELS: Record<'wifi' | 'lte' | 'gemini', string> = {
    wifi: '📡 Wi-Fi',
    lte: '📶 LTE / Wi-Fi',
    gemini: '✨ LTE / Wi-Fi / Gemini',
  };
  const variant = (net: 'wifi' | 'lte' | 'gemini') => {
    const v = plan[net];
    const url = href ?? `/checkout/${plan.id}?net=${net}`;
    const accent =
      net === 'gemini'
        ? 'border-fuchsia-400/40 hover:bg-fuchsia-400/10'
        : net === 'lte'
          ? 'border-amber-400/40 hover:bg-amber-400/10'
          : 'border-galaxy-accent/40 hover:bg-galaxy-accent/10';
    return (
      <div className={`flex flex-col rounded-xl border ${accent} p-3`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide">{LABELS[net]}</span>
          <span className="text-lg font-bold">
            {v.priceRub} <span className="text-xs font-normal text-white/70">₽</span>
          </span>
        </div>
        <div className="mt-1 text-xs text-white/70">{t('servers', { count: v.serverCount })}</div>
        <Link
          href={url}
          className="mt-3 rounded-lg bg-galaxy-primary px-3 py-2 text-center text-xs font-medium hover:opacity-90"
        >
          {t('buy')}
        </Link>
      </div>
    );
  };

  return (
    <div className={`glass flex flex-col p-5 ${featured ? 'ring-2 ring-galaxy-accent' : ''}`}>
      <div className="text-sm font-semibold uppercase tracking-wide text-white/60">
        {t(`duration.${plan.durationKey}`)}
      </div>
      <p className="mt-1 text-xs text-white/50">{t('share')}</p>
      <div className="mt-4 grid gap-3">
        {variant('wifi')}
        {variant('lte')}
        {variant('gemini')}
      </div>
    </div>
  );
}
