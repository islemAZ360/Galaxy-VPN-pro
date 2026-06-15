'use client';

import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="relative w-full border-t border-white/10 bg-[#06060c] py-8 px-8 mt-auto overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-galaxy-primary/50 to-transparent" />
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
            <img src="/icon-192x192.png" alt="GalaxyVPN Icon" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">
              <span className="bg-gradient-to-r from-galaxy-accent to-violet-400 bg-clip-text text-transparent">Galaxy</span>VPN
            </span>
            <span className="text-[11px] font-medium tracking-widest text-white/35 uppercase">
              {t('rights')}
            </span>
          </div>
        </div>
        <Link
          href="/support"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold tracking-wide text-galaxy-accent transition-all hover:bg-white/10 hover:text-white"
        >
          {t('contact')}
        </Link>
      </div>
    </footer>
  );
}
