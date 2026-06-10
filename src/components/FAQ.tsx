'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

const FAQ_KEYS = [
  'whatIsVpn',
  'howToUse',
  'whichDevices',
  'paymentMethods',
  'howManyDevices',
  'serverDifference',
  'geminiServer',
  'lteServer',
  'cancelRefund',
  'notWorking',
] as const;

export function FAQ() {
  const t = useTranslations('faq');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {FAQ_KEYS.map((key, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={key}
            className={`rounded-2xl border transition-colors ${
              isOpen ? 'border-galaxy-primary/30 bg-white/[0.06]' : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="font-semibold text-white">{t(`${key}.q`)}</span>
              <ChevronDown
                className={`w-5 h-5 shrink-0 text-galaxy-primary transition-transform duration-300 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <p className="px-6 pb-5 text-sm leading-relaxed text-white/60">
                {t(`${key}.a`)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
