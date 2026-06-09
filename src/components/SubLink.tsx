'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function SubLink({ url }: { url: string }) {
  const t = useTranslations('profile');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }

  return (
    <div>
      <label className="text-sm font-medium">{t('subLinkLabel')}</label>
      <div className="mt-2 flex items-stretch gap-2">
        <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-galaxy-accent" dir="ltr">
          {url}
        </code>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg bg-galaxy-primary px-4 text-sm font-medium hover:opacity-90"
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <p className="mt-2 text-xs text-white/50">{t('subLinkHint')}</p>
    </div>
  );
}
