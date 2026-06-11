'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone, Monitor } from 'lucide-react';

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
      <div className="mt-4 rounded-lg bg-white/5 p-4 border border-white/10">
        <p className="text-sm text-white/80 leading-relaxed mb-4">{t('subLinkHint')}</p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://play.google.com/store/apps/details?id=app.hiddify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
          >
            <Smartphone className="w-4 h-4" />
            {t('downloadMobile')}
          </a>
          <a
            href="https://github.com/hiddify/hiddify-next/releases/latest/download/Hiddify-Windows-Setup-x64.exe"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
          >
            <Monitor className="w-4 h-4" />
            {t('downloadPC')}
          </a>
        </div>
      </div>
    </div>
  );
}
