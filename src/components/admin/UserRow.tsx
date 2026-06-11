'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { getPlan } from '@/lib/plans';
import {
  banUser,
  unbanUser,
  deleteUser,
  setSubscriptionTime,
  sendUserMessage,
} from '@/lib/admin-actions';

const UNIT_MS: Record<string, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  months: 30 * 86_400_000,
};

export function UserRow({
  userId,
  email,
  role,
  bannedUntil,
  subEnd,
  plan,
  network,
}: {
  userId: string;
  email: string;
  role: string;
  bannedUntil: string | null;
  subEnd: string | null;
  plan: number | null;
  network: 'wifi' | 'lte' | 'gemini' | null;
  devices?: { ip_address: string; device_type: string; last_seen_at: string }[];
}) {
  const t = useTranslations('admin.users');
  const tp = useTranslations('plans');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [amount, setAmount] = useState('30');
  const [unit, setUnit] = useState<keyof typeof UNIT_MS>('days');
  const [banDays, setBanDays] = useState('30');
  const [msg, setMsg] = useState('');

  const banned = bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
  const isAdmin = role === 'admin';
  const p = plan ? getPlan(plan) : null;

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const applyTime = (mode: 'set' | 'add') => {
    const ms = Number(amount) * UNIT_MS[unit];
    if (!ms || ms <= 0) return;
    run(() => setSubscriptionTime(userId, ms, mode));
  };

  const inputCls = 'rounded-md border border-white/15 bg-galaxy-surface px-2 py-1 text-xs';
  const btnCls = 'rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50';

  return (
    <div className="glass p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" dir="ltr">{email}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60">
            <span className="rounded bg-white/10 px-1.5 py-0.5">{role}</span>
            <span className={banned ? 'text-red-400' : 'text-emerald-400'}>
              {banned ? t('banned') : t('active')}
            </span>
            {p && <span>· {tp(`duration.${p.durationKey}`)}</span>}
            {network && (
              <span
                className={
                  network === 'gemini'
                    ? 'rounded bg-fuchsia-400/15 px-1.5 py-0.5 text-fuchsia-300'
                    : network === 'lte'
                      ? 'rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-300'
                      : 'rounded bg-galaxy-accent/15 px-1.5 py-0.5 text-galaxy-accent'
                }
              >
                {network === 'gemini' ? '✨ Gemini' : network === 'lte' ? '📶 LTE' : '📡 Wi-Fi'}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-white/50">
            {t('subEnds')}: {subEnd ? new Date(subEnd).toLocaleString() : t('none')}
          </div>
          {devices && devices.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="text-white/50 w-full mb-1">Devices ({devices.length}):</span>
              {devices.map((d, i) => (
                <div key={i} className="flex flex-col rounded bg-white/5 px-2 py-1 border border-white/10">
                  <span className="text-galaxy-accent font-mono">{d.ip_address}</span>
                  <div className="flex items-center gap-1 mt-0.5 text-white/50">
                    <span>{d.device_type}</span>
                    <span>·</span>
                    <span>{new Date(d.last_seen_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/50">{t('time')}:</span>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} w-20`}
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as keyof typeof UNIT_MS)}
              className={inputCls}
            >
              <option value="seconds">{t('seconds')}</option>
              <option value="minutes">{t('minutes')}</option>
              <option value="hours">{t('hours')}</option>
              <option value="days">{t('days')}</option>
              <option value="months">{t('months')}</option>
            </select>
            <button onClick={() => applyTime('set')} disabled={isPending} className={btnCls}>{t('setTime')}</button>
            <button onClick={() => applyTime('add')} disabled={isPending} className={btnCls}>{t('addTime')}</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {banned ? (
              <button onClick={() => run(() => unbanUser(userId))} disabled={isPending} className={btnCls}>
                {t('unban')}
              </button>
            ) : (
              <>
                <span className="text-xs text-white/50">{t('banFor')}:</span>
                <input
                  type="number"
                  min="1"
                  value={banDays}
                  onChange={(e) => setBanDays(e.target.value)}
                  className={`${inputCls} w-16`}
                />
                <span className="text-xs text-white/50">{t('days')}</span>
                <button
                  onClick={() => run(() => banUser(userId, Number(banDays) || 1))}
                  disabled={isPending}
                  className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                >
                  {t('banBtn')}
                </button>
              </>
            )}
            <button
              onClick={() => confirm(t('confirmDelete')) && run(() => deleteUser(userId))}
              disabled={isPending}
              className="ms-auto rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              {t('delete')}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={t('messagePlaceholder')}
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={() =>
                msg.trim() &&
                run(async () => {
                  await sendUserMessage(userId, msg);
                  setMsg('');
                })
              }
              disabled={isPending}
              className={btnCls}
            >
              {t('sendMessage')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
