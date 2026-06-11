'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone, Monitor, Copy, CheckCircle2, Download, PlusCircle, Power, AlertTriangle } from 'lucide-react';

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
          className="shrink-0 flex items-center justify-center w-12 rounded-lg bg-galaxy-primary text-sm font-medium hover:opacity-90 transition-opacity"
          aria-label={t('copy')}
        >
          {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-300" /> : <Copy className="w-5 h-5 text-white" />}
        </button>
      </div>

      <div className="mt-6 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="bg-white/5 px-4 py-3 border-b border-white/5">
          <h3 className="font-medium text-sm text-white/90">How to connect with Hupp</h3>
        </div>
        
        <div className="p-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-galaxy-accent/20 flex items-center justify-center text-galaxy-accent font-bold text-xs">1</div>
              <p className="text-sm text-white/80">{t('step1')}</p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-galaxy-accent/20 flex items-center justify-center text-galaxy-accent font-bold text-xs">2</div>
              <div className="flex-1">
                <p className="text-sm text-white/80 mb-3">{t('step2')}</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="#"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs hover:bg-white/20 transition-colors border border-white/5"
                  >
                    <Smartphone className="w-4 h-4" />
                    {t('downloadMobile')}
                  </a>
                  <a
                    href="#"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs hover:bg-white/20 transition-colors border border-white/5"
                  >
                    <Monitor className="w-4 h-4" />
                    {t('downloadPC')}
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-galaxy-accent/20 flex items-center justify-center text-galaxy-accent font-bold text-xs">3</div>
              <p className="text-sm text-white/80">{t('step3')}</p>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-emerald-400/20 flex items-center justify-center text-emerald-400 font-bold text-xs">4</div>
              <p className="text-sm text-white/80">{t('step4')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-red-500/10 border border-red-500/30 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-400 text-lg mb-1">{t('routingGuideTitle')}</h3>
              <p className="text-sm text-red-200/90 mb-4 leading-relaxed">
                {t('routingGuideDesc')}
              </p>
              
              <ul className="space-y-2 text-sm text-red-200/80">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {t('routingStep1')}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {t('routingStep2')}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {t('routingStep3')}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {t('routingStep4')}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {t('routingStep5')}
                </li>
                <li className="flex items-center gap-2 font-medium text-red-300 mt-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {t('routingStep6')}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
