'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter, routing } from '@/i18n/routing';
import { useTransition } from 'react';

const LABELS: Record<string, string> = { ru: 'RU', en: 'EN', ar: 'AR' };

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label="Language"
      value={locale}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => router.replace(pathname, { locale: next }));
      }}
      className="rounded-lg border border-white/15 bg-galaxy-surface px-2 py-1.5 text-sm"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LABELS[l] ?? l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
