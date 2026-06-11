'use client';

import { useTranslations } from 'next-intl';
import { Smartphone, Monitor, AlertTriangle } from 'lucide-react';

export function HuppInstructions() {
  const t = useTranslations('profile');

  return (
    <div className="space-y-6 mt-8">
      <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="bg-white/5 px-4 py-3 border-b border-white/5">
          <h3 className="font-medium text-sm text-white/90">How to connect with Hupp</h3>
        </div>
        
        <div className="p-4 sm:p-6">
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-galaxy-accent/20 flex items-center justify-center text-galaxy-accent font-bold text-sm border border-galaxy-accent/30">1</div>
              <p className="text-sm text-white/80 leading-relaxed pt-1">{t('step1')}</p>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-galaxy-accent/20 flex items-center justify-center text-galaxy-accent font-bold text-sm border border-galaxy-accent/30">2</div>
              <div className="flex-1 pt-1">
                <p className="text-sm text-white/80 mb-3">{t('step2')}</p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="#"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20 transition-colors border border-white/5"
                  >
                    <Smartphone className="w-4 h-4" />
                    {t('downloadMobile')}
                  </a>
                  <a
                    href="#"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20 transition-colors border border-white/5"
                  >
                    <Monitor className="w-4 h-4" />
                    {t('downloadPC')}
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-galaxy-accent/20 flex items-center justify-center text-galaxy-accent font-bold text-sm border border-galaxy-accent/30">3</div>
              <p className="text-sm text-white/80 leading-relaxed pt-1">{t('step3')}</p>
            </div>

            <div className="flex items-start gap-4">
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-emerald-400/20 flex items-center justify-center text-emerald-400 font-bold text-sm border border-emerald-400/30 shadow-[0_0_10px_rgba(52,211,153,0.2)]">4</div>
              <p className="text-sm text-white/80 leading-relaxed pt-1">{t('step4')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-red-500/10 border border-red-500/30 overflow-hidden relative shadow-[0_0_15px_rgba(239,68,68,0.1)]">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-red-400 to-red-600" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="bg-red-500/20 p-2 rounded-lg shrink-0 mt-0.5 border border-red-500/30">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-red-400 text-lg mb-2">{t('routingGuideTitle')}</h3>
              <p className="text-sm text-red-200/90 mb-5 leading-relaxed">
                {t('routingGuideDesc')}
              </p>
              
              <ul className="space-y-3 text-sm text-red-200/80">
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  <span className="leading-relaxed">{t('routingStep1')}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  <span className="leading-relaxed">{t('routingStep2')}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  <span className="leading-relaxed">{t('routingStep3')}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  <span className="leading-relaxed">{t('routingStep4')}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  <span className="leading-relaxed">{t('routingStep5')}</span>
                </li>
                <li className="flex items-start gap-3 font-medium text-red-300 mt-4 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-1.5 animate-pulse" />
                  <span className="leading-relaxed">{t('routingStep6')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
