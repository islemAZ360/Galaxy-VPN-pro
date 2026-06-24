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
  deleteSubscription,
  sendUserMessage,
  changeSubscriptionNetwork,
} from '@/lib/admin-actions';
import { Copy, Check } from 'lucide-react';

const UNIT_MS: Record<string, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  months: 30 * 86_400_000,
};

type SubData = {
  id: string;
  token: string;
  end_at: string | null;
  plan: number | null;
  network: 'wifi' | 'lte' | 'gemini' | null;
  server_count: number | null;
  active_ip_count: number;
  status: string;
  created_at: string;
};

type Device = {
  subscription_id: string;
  ip_address: string;
  device_type: string;
  last_seen_at: string;
};

function DeviceCard({ d }: { d: Device }) {
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInfo = async () => {
    if (info || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`https://ipwho.is/${d.ip_address}`);
      const data = await res.json();
      if (data.success) {
        setInfo(`${data.country} — ${data.connection?.org || data.connection?.isp || 'Unknown ISP'}`);
      } else {
        setInfo('Info not found');
      }
    } catch (e) {
      setInfo('Error fetching');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col rounded bg-black/20 px-2 py-1 border border-white/5 min-w-[140px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-galaxy-accent font-mono">{d.ip_address}</span>
        <button 
          onClick={fetchInfo}
          disabled={loading}
          className="text-white/30 hover:text-white transition-colors cursor-pointer"
          title="Lookup IP Info (Country & ISP)"
        >
          {loading ? '...' : '🔍'}
        </button>
      </div>
      <div className="flex items-center gap-1 mt-0.5 text-white/50">
        <span>{d.device_type}</span>
        <span>·</span>
        <span>{new Date(d.last_seen_at).toLocaleDateString()}</span>
      </div>
      {info && (
        <div className="text-emerald-400/90 text-[11px] mt-1 border-t border-white/5 pt-1 break-words max-w-[200px]">
          {info}
        </div>
      )}
    </div>
  );
}

export function UserRow({
  userId,
  email,
  role,
  bannedUntil,
  subscriptions,
  allDevices,
}: {
  userId: string;
  email: string;
  role: string;
  bannedUntil: string | null;
  subscriptions: SubData[];
  allDevices: Device[];
}) {
  const t = useTranslations('admin.users');
  const tp = useTranslations('plans');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [banAmt, setBanAmt] = useState('30');
  const [banUnit, setBanUnit] = useState<keyof typeof UNIT_MS>('days');
  const [msg, setMsg] = useState('');

  // Per-subscription state
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, keyof typeof UNIT_MS>>({});
  const [newNetwork, setNewNetwork] = useState<'wifi' | 'lte' | 'gemini'>('lte');
  const [newServerCount, setNewServerCount] = useState<string>('');

  const banned = bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
  const isAdmin = role === 'admin';

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const applyTime = (subId: string | null, mode: 'set' | 'add') => {
    const amt = amounts[subId ?? 'new'] || '30';
    const u = units[subId ?? 'new'] || 'days';
    const ms = Number(amt) * UNIT_MS[u];
    if (!ms || ms <= 0) return;
    
    const customCount = subId === null && newServerCount.trim() !== '' ? parseInt(newServerCount, 10) : undefined;
    run(() => setSubscriptionTime(subId, userId, ms, mode, newNetwork, customCount));
  };

  const inputCls = 'rounded-md border border-white/15 bg-galaxy-surface px-2 py-1 text-xs';
  const btnCls = 'rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50';

  return (
    <div className="admin-panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-lg" dir="ltr">{email}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60">
            <span className="rounded bg-white/10 px-1.5 py-0.5">{role}</span>
            <span className={banned ? 'text-red-400' : 'text-emerald-400'}>
              {banned ? t('banned') : t('active')}
            </span>
            {bannedUntil && banned && (
              <span>Until: {new Date(bannedUntil).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {subscriptions.map((sub) => {
          const p = sub.plan ? getPlan(sub.plan) : null;
          const network = sub.network;
          const devices = allDevices.filter(d => d.subscription_id === sub.id);
          const isExpired = sub.status === 'expired' || (sub.end_at && new Date(sub.end_at).getTime() < Date.now());

          return (
            <div key={sub.id} className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 transition-colors hover:border-white/15">
              <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded ${isExpired || sub.status === 'rejected' ? 'bg-red-400/20 text-red-300' : 'bg-emerald-400/20 text-emerald-300'}`}>
                  {isExpired ? 'EXPIRED' : sub.status.toUpperCase()}
                </span>
                {p && <span className="text-white/80">· {tp(`duration.${p.durationKey}`)}</span>}
                {network && (
                  <span className={network === 'gemini' ? 'text-fuchsia-300' : network === 'lte' ? 'text-amber-300' : 'text-galaxy-accent'}>
                    · {network === 'gemini' ? '✨ Gemini (LTE & Wi-Fi)' : network === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi'}
                  </span>
                )}
                {sub.server_count != null && (
                  <span className="text-white/80 font-mono">
                    · {sub.server_count} Servers
                  </span>
                )}
                <span className={`font-mono ${sub.active_ip_count > 20 ? 'text-red-400 font-bold' : 'text-white/80'}`}>
                  · 🌐 {sub.active_ip_count}/20 IPs (24h)
                </span>
                <span className="text-white/50 ml-auto flex items-center gap-2">
                  {t('subEnds')}: {sub.end_at ? (
                    <>
                      {new Date(sub.end_at).toLocaleString()}
                      <span className="text-galaxy-accent font-medium ml-1">
                        {(() => {
                          const ms = new Date(sub.end_at).getTime() - Date.now();
                          if (ms <= 0) return '(Expired)';
                          const d = Math.floor(ms / 86400000);
                          const h = Math.floor((ms % 86400000) / 3600000);
                          if (d > 0) return `(${d}d ${h}h left)`;
                          const m = Math.floor((ms % 3600000) / 60000);
                          return `(${h}h ${m}m left)`;
                        })()}
                      </span>
                    </>
                  ) : t('none')}
                  <button 
                    onClick={(e) => {
                      const url = `${window.location.origin}/sub/${sub.id}`;
                      navigator.clipboard.writeText(url);
                      const btn = e.currentTarget;
                      const originalHTML = btn.innerHTML;
                      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                      setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
                    }}
                    title="Copy Subscription Link"
                    className="p-1 rounded-md border border-white/10 hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>

              {devices.length > 0 && (
                <div className="mt-2 mb-3 flex flex-wrap gap-2 text-xs">
                  <span className="text-white/50 w-full mb-1">Devices ({devices.length}):</span>
                  {devices.map((d, i) => (
                    <DeviceCard key={i} d={d} />
                  ))}
                </div>
              )}

              {!isAdmin && (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-white/5">
                  <button
                    onClick={(e) => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/sub/${sub.token}`);
                      const btn = e.currentTarget;
                      const originalText = btn.innerText;
                      btn.innerText = 'Copied! ✔';
                      setTimeout(() => { btn.innerText = originalText; }, 1500);
                    }}
                    className={`${btnCls} !text-galaxy-accent !border-galaxy-accent/40 hover:!bg-galaxy-accent/10`}
                  >
                    Copy Link
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={amounts[sub.id] || '30'}
                    onChange={(e) => setAmounts({ ...amounts, [sub.id]: e.target.value })}
                    className={`${inputCls} w-16`}
                  />
                  <select
                    value={units[sub.id] || 'days'}
                    onChange={(e) => setUnits({ ...units, [sub.id]: e.target.value as keyof typeof UNIT_MS })}
                    className={inputCls}
                  >
                    <option value="seconds">{t('seconds')}</option>
                    <option value="minutes">{t('minutes')}</option>
                    <option value="hours">{t('hours')}</option>
                    <option value="days">{t('days')}</option>
                    <option value="months">{t('months')}</option>
                  </select>
                  <button onClick={() => applyTime(sub.id, 'set')} disabled={isPending} className={btnCls}>{t('setTime')}</button>
                  <button onClick={() => applyTime(sub.id, 'add')} disabled={isPending} className={btnCls}>{t('addTime')}</button>
                  <div className="mx-2 w-px h-6 bg-white/10" />
                  <select
                    value={sub.network || 'wifi'}
                    onChange={(e) => run(() => changeSubscriptionNetwork(sub.id, e.target.value as any))}
                    disabled={isPending}
                    className={inputCls}
                  >
                    <option value="wifi">📡 Wi-Fi</option>
                    <option value="lte">📶 LTE / Wi-Fi</option>
                    <option value="gemini">✨ Gemini (LTE & Wi-Fi)</option>
                  </select>
                  <button
                    onClick={() => confirm(t('confirmDelete') || 'Delete this sub?') && run(() => deleteSubscription(sub.id))}
                    disabled={isPending}
                    className="ms-auto rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete Sub
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!isAdmin && subscriptions.length === 0 && (
          <div className="text-sm text-white/50 italic">{t('none') || 'No subscriptions'}</div>
        )}
        
        {!isAdmin && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 mt-2">
            <div className="text-xs text-white/60 mb-2">Grant New Subscription</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number" min="1"
                value={amounts['new'] || '30'}
                onChange={(e) => setAmounts({ ...amounts, ['new']: e.target.value })}
                className={`${inputCls} w-16`}
              />
              <select
                value={units['new'] || 'days'}
                onChange={(e) => setUnits({ ...units, ['new']: e.target.value as keyof typeof UNIT_MS })}
                className={inputCls}
              >
                <option value="seconds">{t('seconds')}</option>
                <option value="minutes">{t('minutes')}</option>
                <option value="hours">{t('hours')}</option>
                <option value="days">{t('days')}</option>
                <option value="months">{t('months')}</option>
              </select>
              <select
                value={newNetwork}
                onChange={(e) => setNewNetwork(e.target.value as any)}
                className={inputCls}
              >
                <option value="wifi">📡 Wi-Fi</option>
                <option value="lte">📶 LTE / Wi-Fi</option>
                <option value="gemini">✨ Gemini (LTE & Wi-Fi)</option>
              </select>
              <input
                type="number" min="1"
                placeholder="Servers (Default)"
                value={newServerCount}
                onChange={(e) => setNewServerCount(e.target.value)}
                className={`${inputCls} w-32`}
                title="Number of servers. Leave empty to use plan default."
              />
              <button onClick={() => applyTime(null, 'add')} disabled={isPending} className={btnCls}>Grant</button>
            </div>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="mt-2 space-y-2 border-t border-white/5 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {banned ? (
              <button onClick={() => run(() => unbanUser(userId))} disabled={isPending} className={btnCls}>
                {t('unban')}
              </button>
            ) : (
              <>
                <span className="text-xs text-white/50">{t('banFor')}:</span>
                <input
                  type="number" min="1"
                  value={banAmt}
                  onChange={(e) => setBanAmt(e.target.value)}
                  className={`${inputCls} w-16`}
                />
                <select
                  value={banUnit}
                  onChange={(e) => setBanUnit(e.target.value as keyof typeof UNIT_MS)}
                  className={inputCls}
                >
                  <option value="seconds">{t('seconds')}</option>
                  <option value="minutes">{t('minutes')}</option>
                  <option value="hours">{t('hours')}</option>
                  <option value="days">{t('days')}</option>
                  <option value="months">{t('months')}</option>
                </select>
                <button
                  onClick={() => run(() => banUser(userId, (Number(banAmt) || 1) * UNIT_MS[banUnit]))}
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
              {t('delete')} User
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
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
