'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { Plan } from '@/lib/plans';

export function PlanCard({ plan, featured }: { plan: Plan; featured?: boolean }) {
  const t = useTranslations('plans');
  return (
    <div
      className={`glass flex flex-col p-6 ${
        featured ? 'ring-2 ring-galaxy-accent' : ''
      }`}
    >
      <div className="text-sm uppercase tracking-wide text-white/60">
        {t(`duration.${plan.durationKey}`)}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-bold">{plan.priceRub}</span>
        <span className="text-white/70">₽</span>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-white/80">
        <li>✦ {t('servers', { count: plan.serverCount })}</li>
        <li>✦ {t('share')}</li>
      </ul>
      <Link
        href={`/checkout/${plan.id}`}
        className="mt-6 rounded-xl bg-galaxy-primary px-4 py-3 text-center font-medium hover:opacity-90"
      >
        {t('buy')}
      </Link>
    </div>
  );
}
