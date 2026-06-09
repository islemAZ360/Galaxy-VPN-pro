'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { banUser, unbanUser, extendSubscription, deleteUser } from '@/lib/admin-actions';

export function UserRow({
  userId,
  email,
  role,
  bannedUntil,
  subEnd,
}: {
  userId: string;
  email: string;
  role: string;
  bannedUntil: string | null;
  subEnd: string | null;
}) {
  const t = useTranslations('admin.users');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const banned = bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
  const isAdmin = role === 'admin';

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <tr className="border-t border-white/5 align-middle">
      <td className="py-2">{email}</td>
      <td className="py-2 text-white/70">{role}</td>
      <td className="py-2 tabular-nums">{subEnd ? new Date(subEnd).toLocaleDateString() : t('none')}</td>
      <td className="py-2">
        <span className={banned ? 'text-red-400' : 'text-emerald-400'}>
          {banned ? t('banned') : t('active')}
        </span>
      </td>
      <td className="py-2">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => run(() => extendSubscription(userId, 30))}
            disabled={isPending}
            className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
          >
            {t('extend')}
          </button>
          {!isAdmin && (
            <>
              {banned ? (
                <button
                  onClick={() => run(() => unbanUser(userId))}
                  disabled={isPending}
                  className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
                >
                  {t('unban')}
                </button>
              ) : (
                <button
                  onClick={() => run(() => banUser(userId, 30))}
                  disabled={isPending}
                  className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                >
                  {t('ban')}
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm(t('confirmDelete'))) run(() => deleteUser(userId));
                }}
                disabled={isPending}
                className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {t('delete')}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
