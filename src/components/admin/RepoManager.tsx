'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { addRepo, deleteRepo } from '@/lib/admin-actions';

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

  return (
    <div className="glass p-5">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-white/60">{t('hint')}</p>

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
