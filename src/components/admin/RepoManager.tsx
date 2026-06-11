'use client';

import { useState, useTransition, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { addRepo, deleteRepo, requestSync } from '@/lib/admin-actions';

type Repo = { id: string; repo_url: string; enabled: boolean };
type RepoStat = {
  repo_url: string;
  files_found: number;
  configs_extracted: number;
  configs_working: number;
  wifi_count: number;
  lte_count: number;
  gemini_count: number;
  last_sync_at: string | null;
};

export function RepoManager({ repos, repoStats }: { repos: Repo[]; repoStats: RepoStat[] }) {
  const t = useTranslations('admin.repos');
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [isPending, startTransition] = useTransition();

  // Build a map for quick lookup
  const statsMap = useMemo(() => {
    const m = new Map<string, RepoStat>();
    for (const s of repoStats) m.set(s.repo_url, s);
    return m;
  }, [repoStats]);

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

  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const requestKind = (kind: 'full' | 'lte' | 'gemini') =>
    startTransition(async () => {
      setSyncMsg(null);
      try {
        await requestSync(kind);
        setSyncMsg(
          kind === 'gemini' ? t('geminiRequested') : kind === 'lte' ? t('lteRequested') : t('syncRequested'),
        );
      } catch (e) {
        setSyncMsg(t('syncFailed') + ' ' + (e instanceof Error ? e.message : ''));
      }
    });
  const recheck = () => requestKind('full');
  const lteRecheck = () => requestKind('lte');
  const geminiRecheck = () => requestKind('gemini');

  return (
    <div className="glass p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-white/60">{t('hint')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={geminiRecheck}
            disabled={isPending}
            title={t('geminiRecheckHint')}
            className="rounded-lg border border-fuchsia-400/40 bg-fuchsia-400/10 px-3 py-2 text-sm font-medium text-fuchsia-300 hover:bg-fuchsia-400/20 disabled:opacity-60"
          >
            ✨ {t('geminiRecheck')}
          </button>
          <button
            onClick={lteRecheck}
            disabled={isPending}
            title={t('lteRecheckHint')}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-400/20 disabled:opacity-60"
          >
            📶 {t('lteRecheck')}
          </button>
          <button
            onClick={recheck}
            disabled={isPending}
            title={t('recheckHint')}
            className="rounded-lg border border-galaxy-accent/40 bg-galaxy-accent/10 px-3 py-2 text-sm font-medium text-galaxy-accent hover:bg-galaxy-accent/20 disabled:opacity-60"
          >
            ↻ {t('recheck')}
          </button>
        </div>
      </div>
      {syncMsg && (
        <p className="mt-3 rounded-lg border border-galaxy-accent/30 bg-galaxy-accent/10 px-3 py-2 text-sm">
          {syncMsg}
        </p>
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
      {repoStats.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
            📦 {t('totalRepos')}: {repos.length}
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
            📄 {t('totalFiles')}: {repoStats.reduce((s, r) => s + r.files_found, 0)}
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
            🔍 {t('totalExtracted')}: {repoStats.reduce((s, r) => s + r.configs_extracted, 0).toLocaleString()}
          </span>
          <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-300">
            ✅ {t('totalWorking')}: {repoStats.reduce((s, r) => s + r.configs_working, 0)}
          </span>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {repos.length === 0 && <p className="py-4 text-center text-sm text-white/50">{t('none')}</p>}
        {repos.map((r) => {
          const s = statsMap.get(r.repo_url);
          return (
            <div key={r.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
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
                  <span className="rounded bg-white/5 px-2 py-0.5 text-white/60" title={t('extractedHint')}>
                    🔍 {s.configs_extracted.toLocaleString()} {t('extracted')}
                  </span>
                  <span className="rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300" title={t('workingHint')}>
                    ✅ {s.configs_working} {t('working')}
                  </span>
                  {s.configs_working > 0 && (
                    <>
                      <span className="rounded bg-galaxy-accent/10 px-2 py-0.5 text-galaxy-accent">
                        📡 {s.wifi_count} WiFi
                      </span>
                      <span className="rounded bg-amber-400/10 px-2 py-0.5 text-amber-300">
                        📶 {s.lte_count} LTE
                      </span>
                      <span className="rounded bg-fuchsia-400/10 px-2 py-0.5 text-fuchsia-300">
                        ✨ {s.gemini_count} Gemini
                      </span>
                    </>
                  )}
                  {s.last_sync_at && (
                    <span className="rounded bg-white/5 px-2 py-0.5 text-white/40" title={t('lastSyncHint')}>
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
