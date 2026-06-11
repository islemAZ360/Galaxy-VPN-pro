'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { Plan, NetworkType } from '@/lib/plans';
import { Wifi, Signal, Sparkles, Infinity } from 'lucide-react';

const TIERS: { net: NetworkType; icon: typeof Wifi; title: string; ring: string; chip: string; price: string }[] = [
  { net: 'wifi',   icon: Wifi,      title: 'Wi-Fi',                ring: 'hover:border-galaxy-accent/70', chip: 'bg-galaxy-accent/15 text-galaxy-accent', price: 'text-white' },
  { net: 'lte',    icon: Signal,    title: 'LTE / Wi-Fi',          ring: 'hover:border-amber-400/70',     chip: 'bg-amber-400/15 text-amber-300',         price: 'text-white' },
  { net: 'gemini', icon: Sparkles,  title: 'LTE / Wi-Fi / Gemini', ring: 'hover:border-fuchsia-400/70',   chip: 'bg-fuchsia-400/15 text-fuchsia-300',     price: 'text-white' },
];

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

  return (
    <div
      className={`group/card card-lift relative flex h-full flex-col rounded-2xl border p-5 ${
        featured
          ? 'border-galaxy-accent/50 bg-gradient-to-b from-galaxy-accent/[0.08] to-white/[0.04] shadow-xl shadow-galaxy-accent/15'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-galaxy-accent to-cyan-300 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-galaxy-bg shadow-[0_2px_12px_rgba(34,211,238,0.5)]">
          {t('popular')}
        </span>
      )}

      {/* Header */}
      <div className="border-b border-white/10 pb-4">
        <div className="text-xl font-bold">{t(`duration.${plan.durationKey}`)}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
          <Infinity className="w-4 h-4" /> {t('share')}
        </div>
      </div>

      {/* Tier options */}
      <div className="mt-4 flex flex-1 flex-col gap-2.5">
        {TIERS.map(({ net, icon: Icon, title, ring, chip, price }) => {
          const v = plan[net];
          const url = href ?? `/checkout/${plan.id}?net=${net}`;
          return (
            <Link
              key={net}
              href={url}
              aria-label={`${t(`duration.${plan.durationKey}`)} — ${title} — ${v.priceRub}₽`}
              className={`flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/[0.04] ${ring}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${chip}`}>
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold leading-tight">{title}</div>
                <div className="text-[11px] text-white/55">{t('servers', { count: v.serverCount })}</div>
              </div>
              <div className="text-end">
                <div className={`text-lg font-extrabold leading-none ${price}`}>
                  {v.priceRub}
                  <span className="ms-0.5 text-xs font-normal text-white/60">₽</span>
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-galaxy-accent opacity-70 transition group-hover/card:opacity-100">
                  {t('buy')} →
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
