'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

type Status = {
  state?: string;
  last_seen?: string | null;
  last_sync_at?: string | null;
  last_result?: { working?: number; deleted?: number } | null;
} | null;

export function WorkerStatus({ initial }: { initial: Status }) {
  const t = useTranslations('admin.worker');
  const [status, setStatus] = useState<Status>(initial);
  const [, force] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data } = await supabase.from('worker_status').select('*').eq('id', 'worker').maybeSingle();
      if (active && data) setStatus(data as Status);
    })();
    const ch = supabase
      .channel('admin-worker-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_status' }, (p) =>
        setStatus(p.new as Status),
      )
      .subscribe();
    const tick = setInterval(() => force((x) => x + 1), 3000); // refresh freshness
    return () => {
      active = false;
      supabase.removeChannel(ch);
      clearInterval(tick);
    };
  }, []);

  const sinceSeen = status?.last_seen ? Date.now() - new Date(status.last_seen).getTime() : Infinity;
  const online = sinceSeen < 30_000;
  const syncing = online && status?.state === 'syncing';
  const r = status?.last_result;

  const dot = syncing ? 'bg-amber-400 animate-pulse' : online ? 'bg-emerald-400' : 'bg-red-500';
  const label = syncing ? t('syncing') : online ? t('online') : t('offline');

  const ago = (ms: number) =>
    ms === Infinity ? t('never') : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`;

  return (
    <div className="glass flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {t('title')}: {label}
      </span>
      {!online && (
        <span className="text-white/50">
          {t('lastSeen')} {ago(sinceSeen)} · {t('startHint')}
        </span>
      )}
      {r?.working != null && (
        <span className="text-white/60">
          {t('lastSync')}: {t('live', { count: r.working })}
          {r.deleted ? ` · −${r.deleted}` : ''}
        </span>
      )}
    </div>
  );
}
