'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

function diff(endMs: number) {
  const total = Math.max(0, endMs - Date.now());
  const s = Math.floor(total / 1000);
  return {
    total,
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

export function CountdownTimer({ endAt }: { endAt: string }) {
  const t = useTranslations('profile');
  const router = useRouter();
  const endMs = new Date(endAt).getTime();
  const [time, setTime] = useState(() => diff(endMs));

  useEffect(() => {
    const id = setInterval(() => {
      const next = diff(endMs);
      setTime(next);
      if (next.total <= 0) {
        clearInterval(id);
        router.refresh(); // flip to "expired" state
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endMs, router]);

  const cell = (value: number, label: string) => (
    <div className="flex min-w-16 flex-col items-center rounded-xl bg-white/5 px-3 py-2">
      <span className="text-3xl font-bold tabular-nums">{String(value).padStart(2, '0')}</span>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );

  return (
    <div className="flex gap-3">
      {cell(time.d, t('d'))}
      {cell(time.h, t('h'))}
      {cell(time.m, t('m'))}
      {cell(time.s, t('s'))}
    </div>
  );
}
