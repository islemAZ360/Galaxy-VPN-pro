'use client';

import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="w-full border-t border-white/10 bg-[#06060c] py-6 px-8 mt-auto">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Shield className="h-4 w-4 text-white/70" />
          </div>
          <span className="text-xs font-medium tracking-widest text-white/40 uppercase">
            {t('rights')}
          </span>
        </div>
        <Link
          href="/support"
          className="text-sm font-semibold tracking-wide text-galaxy-accent transition-colors hover:text-white"
        >
          {t('contact')}
        </Link>
      </div>
    </footer>
  );
}
