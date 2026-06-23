'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { addRepo, deleteRepo, requestSync, triggerGithubScan, checkGithubScanStatus } from '@/lib/admin-actions';
import { useWorkerPresence } from '@/hooks/useWorkerPresence';

type Repo = { id: string; repo_url: string; enabled: boolean };
type RepoStat = {
  repo_url: string;
  files_found: number;
  configs_extracted: number;
  configs_working: number;
  wifi_count: number;
  lte_count: number;
  gemini_count: number;
  gemini_lte_count?: number;
  gemini_wifi_count?: number;
  last_sync_at: string | null;
};
type ScanEntry = {
  id: string;
  kind: string;
  requested_at: string;
  processed_at: string | null;
  result: Record<string, unknown> | null;
};

const KIND_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  wifi:        { emoji: '📡', label: 'Wi-Fi → Gemini', color: 'text-galaxy-accent' },
  full:        { emoji: '📡', label: 'Wi-Fi',        color: 'text-galaxy-accent' },
  lte:         { emoji: '📶', label: 'LTE → Gemini', color: 'text-amber-300' },
  whitelist:   { emoji: '🛡️', label: 'White-List', color: 'text-white' },
  gemini_wifi: { emoji: '✨', label: 'Gemini / Wi-Fi', color: 'text-fuchsia-300' },
  gemini_lte:  { emoji: '✨', label: 'Gemini / LTE / Wi-Fi', color: 'text-purple-300' },
  latency:     { emoji: '⏱️', label: 'Latency',      color: 'text-cyan-300' },
};

export function RepoManager({ 
  repos, 
  repoStats,
  scanHistory,
}: { 
  repos: Repo[]; 
  repoStats: RepoStat[];
  scanHistory: ScanEntry[];
}) {
  const t = useTranslations('admin.repos');
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { online: isLive, syncing: isBusy } = useWorkerPresence();
  
  // GitHub Action Status
  const [ghRunning, setGhRunning] = useState(false);
  const [ghError, setGhError] = useState('');

  // Percentage Slider State
  const [basePercentage, setBasePercentage] = useState<number>(100);
  const [detailsPercentage, setDetailsPercentage] = useState<number>(100);

  // Poll GitHub Action Status every 15 seconds
  useEffect(() => {
    let mounted = true;
    const checkGh = async () => {
      try {
        const res = await checkGithubScanStatus();
        if (!mounted) return;
        if (res.error) setGhError(res.error);
        else setGhRunning(!!res.isRunning);
      } catch {
        // silently ignore
      }
    };
    checkGh();
    const interval = setInterval(checkGh, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Build a map for quick lookup and filter out ghost stats
  const statsMap = useMemo(() => {
    const m = new Map<string, RepoStat>();
    for (const s of repoStats) m.set(s.repo_url, s);
    return m;
  }, [repoStats]);

  const activeUrls = useMemo(() => new Set(repos.map((r) => r.repo_url)), [repos]);
  const activeStats = useMemo(() => repoStats.filter(s => activeUrls.has(s.repo_url)), [repoStats, activeUrls]);

  // Duplicate detection
  const existingUrls = useMemo(() => new Set(repos.map((r) => r.repo_url.trim().toLowerCase().replace(/\.git\/?$/, ''))), [repos]);
  const normalizedInput = url.trim().toLowerCase().replace(/\.git\/?$/, '');
  const isDuplicate = normalizedInput.length > 10 && existingUrls.has(normalizedInput);

  const add = () => {
    const v = url.trim();
    if (!v || isDuplicate) return;
    startTransition(async () => {
      await addRepo(v);
      setUrl('');
      router.refresh();
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      await deleteRepo(id);
      router.refresh();
    });

  const [syncMsg, setSyncMsg] = useState<{ type: 'error' | 'success' | 'warning', text: string } | null>(null);
  const requestKind = (kind: 'wifi' | 'lte' | 'whitelist') => {
    if (!isLive) {
      setSyncMsg({ type: 'error', text: 'Worker is offline! Please start the Tester Worker first.' });
      return;
    }
    if (isBusy) {
      setSyncMsg({ type: 'warning', text: 'Worker is already busy syncing. Please wait.' });
      return;
    }

    startTransition(async () => {
      setSyncMsg(null);
      try {
        await requestSync(kind, basePercentage, detailsPercentage);
        setSyncMsg({ type: 'success', text: kind === 'lte' ? t('lteRequested') : kind === 'whitelist' ? 'White-list re-check requested — run it while the LTE white-list block is active.' : t('syncRequested') });
      } catch (e) {
        setSyncMsg({ type: 'error', text: t('syncFailed') + ' ' + (e instanceof Error ? e.message : '') });
      }
    });
  };
  const wifiRecheck = () => requestKind('wifi');
  const lteRecheck = () => requestKind('lte');
  const whitelistRecheck = () => requestKind('whitelist');

  const runGithubScan = () => {
    startTransition(async () => {
      setSyncMsg(null);
      try {
        const res = await triggerGithubScan(basePercentage);
        if (res?.error) {
          setSyncMsg({ type: 'error', text: 'Failed to trigger GitHub Scan: ' + res.error });
        } else {
          setGhRunning(true);
          setSyncMsg({ type: 'success', text: 'GitHub Actions scan triggered successfully! The background scan will run for a few minutes.' });
        }
      } catch (e) {
        setSyncMsg({ type: 'error', text: 'Failed to trigger GitHub Scan: ' + (e instanceof Error ? e.message : 'Unknown error') });
      }
    });
  };

  return (
    <div className="admin-panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-white/60">{t('hint')}</p>
        </div>
        
        {/* Actions & Slider Row */}
        <div className="flex shrink-0 flex-col items-end gap-3">
          {/* Sliders Area (Flat & Horizontal) */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm shadow-sm">
            <div className="flex items-center gap-2 border-r border-white/10 pr-4">
              <svg className="h-4 w-4 text-galaxy-accent" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" /></svg>
              <span className="font-medium text-white/80">Test Limits</span>
            </div>
            
            {/* Base Limit */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/60" title="Percentage of servers to run the basic Wi-Fi/LTE reachability tests on">Base:</span>
              <input
                type="range" min="1" max="100" value={basePercentage}
                onChange={(e) => setBasePercentage(parseInt(e.target.value))}
                className="w-24 cursor-pointer accent-sky-400 hover:accent-sky-300"
              />
              <span className="w-8 text-right font-mono text-xs font-bold text-sky-400">{basePercentage}%</span>
            </div>
            
            {/* Gemini Limit */}
            <div className="flex items-center gap-3 border-l border-white/10 pl-4">
              <span className="text-xs text-white/60" title="Percentage of working servers to run the Gemini details test on">Deep Scan:</span>
              <input
                type="range" min="1" max="100" value={detailsPercentage}
                onChange={(e) => setDetailsPercentage(parseInt(e.target.value))}
                className="w-24 cursor-pointer accent-purple-500 hover:accent-purple-400"
              />
              <span className="w-8 text-right font-mono text-xs font-bold text-purple-400">{detailsPercentage}%</span>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={runGithubScan}
            disabled={isPending || ghRunning}
            title="Force GitHub to scan all repos right now"
            className="rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/20 disabled:opacity-60 flex items-center gap-1"
          >
            {ghRunning ? '⚙️ Scanning...' : '🤖 Run GitHub Scan'}
          </button>
          <button
            onClick={wifiRecheck}
            disabled={isPending}
            title={t('wifiCascadeHint')}
            className="rounded-lg border border-galaxy-accent/40 bg-galaxy-accent/10 px-3 py-2 text-sm font-medium text-galaxy-accent hover:bg-galaxy-accent/20 disabled:opacity-60"
          >
            📡 {t('wifiCascade')}
          </button>
          <button
            onClick={lteRecheck}
            disabled={isPending}
            title={t('lteCascadeHint')}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-400/20 disabled:opacity-60"
          >
            📶 {t('lteCascade')}
          </button>
          <button
            onClick={whitelistRecheck}
            disabled={isPending}
            title="Run while the government white-list block is active on LTE — re-tests the LTE pool and tags the survivors as White-List (served to LTE & Gemini subscribers)."
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
          >
            🛡️ WhiteList
          </button>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-sm font-medium text-sky-300 hover:bg-sky-400/20"
          >
            ❓ {t('instructionsBtn')}
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-400/20"
          >
            📋 {t('scanHistoryBtn')}
          </button>
        </div>
        </div>
      </div>
      
      {/* Smart Indicator for GitHub Actions */}
      {ghRunning && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 text-sm text-purple-200">
          <div className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-purple-500"></span>
          </div>
          <div>
            <strong>GitHub is extracting servers right now.</strong> This usually takes 2-5 minutes. The list of candidates will update automatically when finished.
          </div>
        </div>
      )}
      
      {showInstructions && (
        <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-100 leading-relaxed space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sky-300 text-base">{t('instructionsTitle')}</h3>
            <button onClick={() => setShowInstructions(false)} className="opacity-50 hover:opacity-100 text-lg">✕</button>
          </div>
          <p>
            {t('instructionsIntro')}
          </p>
          <div className="bg-sky-950/40 p-3 rounded-lg border border-sky-500/20">
            <h4 className="font-semibold text-sky-200 mb-2">{t('instructionsStepsTitle')}</h4>
            <ol className="list-decimal list-inside space-y-2">
              <li>{t('instructionsStep1')}</li>
              <li>{t('instructionsStep2')}</li>
              <li>{t('instructionsStep3')}</li>
              <li>{t.rich('instructionsStep4', { code: (chunks) => <code className="bg-black/30 px-1.5 py-0.5 rounded text-sky-200" dir="ltr">{chunks}</code> })}</li>
              <li>{t('instructionsStep5')}</li>
              <li>{t.rich('instructionsStep6', { code: (chunks) => <code className="bg-black/30 px-1.5 py-0.5 rounded text-sky-200" dir="ltr">{chunks}</code> })}</li>
            </ol>
          </div>
          <p className="text-xs opacity-70 mt-2">
            {t('instructionsNote')}
          </p>
        </div>
      )}
      {/* Scan History Panel */}
      {showHistory && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm leading-relaxed">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-emerald-300 text-base">📋 {t('scanHistoryTitle')}</h3>
            <button onClick={() => setShowHistory(false)} className="opacity-50 hover:opacity-100 text-lg">✕</button>
          </div>
          {scanHistory.length === 0 ? (
            <p className="text-white/40 text-center py-4">{t('scanHistoryEmpty')}</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {scanHistory.map((entry) => {
                const k = KIND_LABELS[entry.kind] || { emoji: '❓', label: entry.kind, color: 'text-white/60' };
                const isProcessed = !!entry.processed_at;
                const result = entry.result as Record<string, unknown> | null;
                const duration = isProcessed && result?.startedAt && result?.finishedAt
                  ? Math.round((Date.parse(result.finishedAt as string) - Date.parse(result.startedAt as string)) / 1000)
                  : null;
                const wasSkipped = result?.skipped === true;
                return (
                  <div key={entry.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${k.color}`}>{k.emoji} {k.label}</span>
                        {wasSkipped && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-300">{t('scanSkipped')}</span>}
                        {isProcessed && !wasSkipped && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-300">✓</span>}
                        {!isProcessed && <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-300 animate-pulse">{t('scanPending')}</span>}
                      </div>
                      <span className="text-xs text-white/40" suppressHydrationWarning>
                        {new Date(entry.requested_at).toLocaleString()}
                      </span>
                    </div>
                    {isProcessed && !wasSkipped && result && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {result.working !== undefined && (
                          <span className="rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300">✅ {String(result.working)} {t('working')}</span>
                        )}
                        {result.candidates !== undefined && (
                          <span className="rounded bg-white/5 px-2 py-0.5 text-white/60">🔍 {String(result.candidates)} {t('scanCandidates')}</span>
                        )}
                        {result.deleted !== undefined && Number(result.deleted) > 0 && (
                          <span className="rounded bg-red-400/10 px-2 py-0.5 text-red-300">🗑 {String(result.deleted)} {t('scanDeleted')}</span>
                        )}
                        {result.lte !== undefined && (
                          <span className="rounded bg-amber-400/10 px-2 py-0.5 text-amber-300">📶 {String(result.lte)} LTE</span>
                        )}
                        {result.gemini !== undefined && (
                          <span className="rounded bg-fuchsia-400/10 px-2 py-0.5 text-fuchsia-300">✨ {String(result.gemini)} Gemini</span>
                        )}
                        {result.wifi !== undefined && (
                          <span className="rounded bg-galaxy-accent/10 px-2 py-0.5 text-galaxy-accent">📡 {String(result.wifi)} Wi-Fi</span>
                        )}
                        {duration !== null && (
                          <span className="rounded bg-white/5 px-2 py-0.5 text-white/40">⏱ {duration}s</span>
                        )}
                      </div>
                    )}
                    {wasSkipped && typeof result?.reason === 'string' && (
                      <p className="mt-1 text-xs text-yellow-300/70">↳ {result.reason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Messages */}
      {syncMsg && (
        <div className={`mt-4 rounded-md border p-3 text-sm flex items-start gap-2 ${
          syncMsg.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' :
          syncMsg.type === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' :
          'border-sky-500/20 bg-sky-500/10 text-sky-200'
        }`}>
          <span className="mt-0.5">
            {syncMsg.type === 'error' ? '⚠️' : syncMsg.type === 'warning' ? '⏳' : '✓'}
          </span>
          <span className="flex-1">{syncMsg.text}</span>
          <button onClick={() => setSyncMsg(null)} className="opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="https://github.com/owner/repo"
          dir="ltr"
          className={`flex-1 rounded-lg border px-3 py-2 text-sm bg-galaxy-surface ${
            isDuplicate ? 'border-red-500/60' : 'border-white/15'
          }`}
        />
        <button
          onClick={add}
          disabled={isPending || isDuplicate}
          className="rounded-lg bg-galaxy-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {t('add')}
        </button>
      </div>
      {isDuplicate && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          ⚠️ {t('duplicateWarning')}
        </p>
      )}

      {/* Total stats summary */}
      {repos.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
            📦 {t('totalRepos')}: {repos.length}
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
            📄 {t('totalFiles')}: {activeStats.reduce((s, r) => s + r.files_found, 0)}
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70" suppressHydrationWarning>
            🔍 {t('totalExtracted')}: {activeStats.reduce((s, r) => s + r.configs_extracted, 0).toLocaleString()}
          </span>
          <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-300">
            ✅ {t('totalWorking')}: {activeStats.reduce((s, r) => s + r.configs_working, 0)}
          </span>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {repos.length === 0 && <p className="py-4 text-center text-sm text-white/50">{t('none')}</p>}
        {repos.map((r) => {
          const s = statsMap.get(r.repo_url);
          return (
            <div key={r.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.04]">
              {/* Header: URL + delete */}
              <div className="flex items-center gap-3">
                <span className="me-auto truncate text-sm font-medium" dir="ltr">
                  {r.repo_url.replace('https://github.com/', '')}
                </span>
                <button
                  onClick={() => remove(r.id)}
                  disabled={isPending}
                  className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {t('delete')}
                </button>
              </div>

              {/* Stats row */}
              {s ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-white/5 px-2 py-0.5 text-white/60" title={t('filesHint')}>
                    📄 {s.files_found} {t('files')}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-0.5 text-white/60" title={t('extractedHint')} suppressHydrationWarning>
                    🔍 {s.configs_extracted.toLocaleString()} {t('extracted')}
                  </span>
                  <span className="rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300" title={t('workingHint')}>
                    ✅ {s.configs_working} {t('working')}
                  </span>
                  {s.configs_working > 0 && (
                    <>
                      <span className="rounded bg-galaxy-accent/10 px-2 py-0.5 text-galaxy-accent">
                        📡 {s.wifi_count} Wi-Fi
                      </span>
                      <span className="rounded bg-amber-400/10 px-2 py-0.5 text-amber-300">
                        📶 {s.lte_count} LTE / Wi-Fi
                      </span>
                      <span className="rounded bg-fuchsia-400/10 px-2 py-0.5 text-fuchsia-300">
                        ✨ {s.gemini_wifi_count as number} Gemini / Wi-Fi
                      </span>
                      <span className="rounded bg-fuchsia-500/10 px-2 py-0.5 text-fuchsia-400">
                        ✨ {s.gemini_lte_count as number} Gemini / LTE / Wi-Fi
                      </span>
                    </>
                  )}
                  {s.last_sync_at && (
                    <span className="rounded bg-white/5 px-2 py-0.5 text-white/40" title={t('lastSyncHint')} suppressHydrationWarning>
                      🕐 {new Date(s.last_sync_at).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-white/30">{t('neverSynced')}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
