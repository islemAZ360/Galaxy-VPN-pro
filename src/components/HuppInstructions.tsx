'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone, Monitor, AlertTriangle, Copy, CheckCircle2 } from 'lucide-react';

const BYPASS_RULES = "happ://routing/add/eyJibG9ja2lwIjpbXSwiYmxvY2tzaXRlcyI6W10sImRpcmVjdGlwIjpbIjEwLjAuMC4wLzgiLCIxNzIuMTYuMC4wLzEyIiwiMTkyLjE2OC4wLjAvMTYiLCIxNjkuMjU0LjAuMC8xNiIsIjIyNC4wLjAuMC80IiwiMjU1LjI1NS4yNTUuMjU1IiwiZ2VvaXA6cnUiXSwiZGlyZWN0c2l0ZXMiOlsibWF4LnJ1IiwiZG9tYWluOjJnaXMucnUiLCJkb21haW46YWRzLng1LnJ1IiwiZG9tYWluOjJnaXMuY29tIiwiZG9tYWluOmFpZi5ydSIsImRvbWFpbjphZXJvZmxvdC5ydSIsImRvbWFpbjphbGZhYmFuay5ydSIsImRvbWFpbjphdml0by5ydSIsImRvbWFpbjpiZWVsaW5lLnJ1IiwiZG9tYWluOmJ1cmdlcmtpbmdydXMucnUiLCJkb21haW46ZGVsbGluLnJ1IiwiZG9tYWluOmRyaXZlMi5ydSIsImRvbWFpbjpkemVuLnJ1IiwiZG9tYWluOmZseXBvYmVkYS5ydSIsImRvbWFpbjpmb3JiZXMucnUiLCJkb21haW46Z2F6ZXRhLnJ1IiwiZG9tYWluOmdhenByb21iYW5rLnJ1IiwiZG9tYWluOmdpc21ldGVvLnJ1IiwiZG9tYWluOmdvc3VzbHVnaS5ydSIsImRvbWFpbjpoaC5ydSIsImRvbWFpbjprb250dXIucnUiLCJkb21haW46a29udHVyLmhvc3QiLCJkb21haW46a3AucnUiLCJkb21haW46a3VwZXIucnUiLCJkb21haW46bGVudGEucnUiLCJkb21haW46bWFpbC5ydSIsImRvbWFpbjptZWdhbWFya2V0LnJ1IiwiZG9tYWluOm1lZ2FtYXJrZXQudGVjaCIsImRvbWFpbjptZWdhZm9uLnJ1IiwiZG9tYWluOm1vZXguY29tIiwiZG9tYWluOm1vdGl2dGVsZWNvbS5ydSIsImRvbWFpbjpvem9uLnJ1IiwiZG9tYWluOnBlcnZ5ZS5ydSIsImRvbWFpbjpwc2JhbmsucnUiLCJkb21haW46cmFtYmxlci5ydSIsImRvbWFpbjpyYW1ibGVyLWNvLnJ1IiwiZG9tYWluOnJiYy5ydSIsImRvbWFpbjpyZWcucnUiLCJkb21haW46cmV2aWV3cy4yZ2lzLmNvbSIsImRvbWFpbjpyZy5ydSIsImRvbWFpbjpyaWEucnUiLCJkb21haW46cnV3aWtpLnJ1IiwiZG9tYWluOnJ1c3RvcmUucnUiLCJkb21haW46cnV0dWJlLnJ1IiwiZG9tYWluOnJ6ZC5ydSIsImRvbWFpbjpzaXJlbmEtdHJhdmVsLnJ1IiwiZG9tYWluOnNyYXZuaS5ydSIsImRvbWFpbjp0LWoucnUiLCJkb21haW46dDIucnUiLCJkb21haW46dGFuay1vbmxpbmUuY29tIiwiZG9tYWluOnRheGltYXhpbS5ydSIsImRvbWFpbjp0YmFuay1vbmxpbmUuY29tIiwiZG9tYWluOnRpbGRhYXBpLmNvbSIsImRvbWFpbjp0bnMtY291bnRlci5ydSIsImRvbWFpbjp0cnZsLnlhbmRleC5uZXQiLCJkb21haW46dHV0dS5ydSIsImRvbWFpbjp2ay5jb20iLCJkb21haW46dmsucnUiLCJkb21haW46dmt2aWRlby5ydSIsImRvbWFpbjp2dGIucnUiLCJkb21haW46eDUucnUiLCJkb21haW46eWEucnUiLCJkb21haW46eWFuZGV4LnJ1IiwiZG9tYWluOnlhbmRleC5uZXQiLCJkb21haW46eWFuZGV4LmNvbSIsImRvbWFpbjp5YXN0YXRpYy5uZXQiLCJkb21haW46eWFuZGV4Y2xvdWQubmV0IiwiZnVsbDpnby55YW5kZXgiLCJmdWxsOnJ1LnJ1d2lraS5ydSIsImRvbWFpbjp4bi0tOTBhY2FnYmhncGNhN2M4YzdmLnhuLS1wMWFpIiwiZG9tYWluOnhuLS04MGFqZ2hob2MyYWoxYzhiLnhuLS1wMWFpIiwiZG9tYWluOnhuLS05MGFpdmNkdDZkeGJjLnhuLS1wMWFpIiwiZG9tYWluOnhuLS1iMWFldy54bi0tcDFhaSIsImRvbWFpbjphcGkub25lbWUucnUiLCJkb21haW46ZmQub25lbWUucnUiLCJkb21haW46aS5vbmVtZS5ydSIsImRvbWFpbjptaW5pYXBwcy5tYXgucnUiLCJkb21haW46c2RrLWFwaS5hcHB0cmFjZXIucnUiLCJkb21haW46c3QubWF4LnJ1IiwiZG9tYWluOnRyYWNrZXItYXBpLnZrLWFuYWx5dGljcy5ydSIsImRvbWFpbjp3Yi5ydSIsImRvbWFpbjp3aWxkYmVycmllcy5ydSJdLCJkbnNob3N0cyI6eyJjbG91ZGZsYXJlLWRucy5jb20iOiIxLjEuMS4xIiwiZG5zLmdvb2dsZSI6IjguOC44LjgifSwiZG9tYWluc3RyYXRlZ3kiOiJJUElmTm9uTWF0Y2giLCJkb21lc3RpY2Ruc2RvbWFpbiI6Imh0dHBzOi8vZG5zLmdvb2dsZS9kbnMtcXVlcnkiLCJkb21lc3RpY2Ruc2lwIjoiOC44LjguOCIsImRvbWVzdGljZG5zdHlwZSI6IkRvSCIsImZha2VkbnMiOmZhbHNlLCJnZW9pcHVybCI6Imh0dHBzOi8vZ2l0aHViLmNvbS9Mb3lhbHNvbGRpZXIvdjJyYXktcnVsZXMtZGF0L3JlbGVhc2VzL2xhdGVzdC9kb3dubG9hZC9nZW9pcC5kYXQiLCJnZW9zaXRldXJsIjoiaHR0cHM6Ly9naXRodWIuY29tL0xveWFsc29sZGllci92MnJheS1ydWxlcy1kYXQvcmVsZWFzZXMvbGF0ZXN0L2Rvd25sb2FkL2dlb3NpdGUuZGF0IiwiZ2xvYmFscHJveHkiOnRydWUsIm5hbWUiOiJCeXBhc3MgUnVzc2lhIiwicHJveHlpcCI6W10sInByb3h5c2l0ZXMiOltdLCJyZW1vdGVkbnNkb21haW4iOiJodHRwczovL2Nsb3VkZmxhcmUtZG5zLmNvbS9kbnMtcXVlcnkiLCJyZW1vdGVkbnNpcCI6IjEuMS4xLjEiLCJyZW1vdGVkbnN0eXBlIjoiRG9IIiwicm91dGVvcmRlciI6ImJsb2NrLWRpcmVjdC1wcm94eSJ9";

export function HuppInstructions() {
  const t = useTranslations('profile');
  const [copiedRules, setCopiedRules] = useState(false);

  async function copyRules() {
    try {
      await navigator.clipboard.writeText(BYPASS_RULES);
      setCopiedRules(true);
      setTimeout(() => setCopiedRules(false), 2000);
    } catch { /* ignore */ }
  }

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
              </ul>
              <button
                onClick={copyRules}
                className="mt-6 flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2.5 text-sm font-medium text-red-200 hover:bg-red-500/30 transition-colors border border-red-500/30 w-full sm:w-auto justify-center"
              >
                {copiedRules ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{t('copiedRules')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{t('copyRules')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
