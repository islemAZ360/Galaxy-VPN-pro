'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { addRepo, deleteRepo, requestSync } from '@/lib/admin-actions';

type Repo = { id: string; repo_url: string; enabled: boolean };

export function RepoManager({ repos }: { repos: Repo[] }) {
  const t = useTranslations('admin.repos');
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [isPending, startTransition] = useTransition();

  const add = () => {
    const v = url.trim();
    if (!v) return;
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
  const recheck = () =>
    startTransition(async () => {
      setSyncMsg(null);
      try {
        await requestSync();
        setSyncMsg(t('syncRequested'));
      } catch (e) {
        setSyncMsg(t('syncFailed') + ' ' + (e instanceof Error ? e.message : ''));
      }
    });

  return (
    <div className="glass p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-white/60">{t('hint')}</p>
        </div>
        <button
          onClick={recheck}
          disabled={isPending}
          title={t('recheckHint')}
          className="shrink-0 rounded-lg border border-galaxy-accent/40 bg-galaxy-accent/10 px-3 py-2 text-sm font-medium text-galaxy-accent hover:bg-galaxy-accent/20 disabled:opacity-60"
        >
          ↻ {t('recheck')}
        </button>
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
          className="flex-1 rounded-lg border border-white/15 bg-galaxy-surface px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          disabled={isPending}
          className="rounded-lg bg-galaxy-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {t('add')}
        </button>
      </div>

      <ul className="mt-4 divide-y divide-white/5">
        {repos.length === 0 && <li className="py-4 text-center text-sm text-white/50">{t('none')}</li>}
        {repos.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <span className="me-auto truncate text-sm" dir="ltr">{r.repo_url}</span>
            <button
              onClick={() => remove(r.id)}
              disabled={isPending}
              className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              {t('delete')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
