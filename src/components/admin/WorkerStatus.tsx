'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useWorkerPresence } from '@/hooks/useWorkerPresence';

type Status = {
  id: string;
  state?: string;
  last_seen?: string | null;
  last_sync_at?: string | null;
  last_result?: { working?: number; deleted?: number } | null;
};

export function WorkerStatus({ initial }: { initial: Status | null }) {
  const t = useTranslations('admin.worker');
  const [pcStatus, setPcStatus] = useState<Status | null>(initial?.id === 'worker' ? initial : null);
  const [phoneStatus, setPhoneStatus] = useState<Status | null>(null);
  
  const { online: pcOnlineRealtime, syncing: pcSyncingRealtime } = useWorkerPresence();
  
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data } = await supabase.from('worker_status').select('*').in('id', ['worker', 'phone-worker']);
      if (active && data) {
        setPcStatus(data.find(d => d.id === 'worker') as Status || null);
        setPhoneStatus(data.find(d => d.id === 'phone-worker') as Status || null);
      }
    })();
    
    const ch = supabase
      .channel('admin-worker-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_status' }, (p) => {
        const newRecord = p.new as Status;
        if (newRecord.id === 'worker') setPcStatus(newRecord);
        if (newRecord.id === 'phone-worker') setPhoneStatus(newRecord);
      })
      .subscribe();
      
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const r = pcStatus?.last_result;

  // Phone is considered online if last_seen is within the last 4 minutes (polls every 3 min)
  const phoneOnline = phoneStatus?.last_seen && (Date.now() - new Date(phoneStatus.last_seen).getTime() < 4 * 60 * 1000);
  
  const pcDot = pcSyncingRealtime ? 'bg-amber-400 animate-pulse' : pcOnlineRealtime ? 'bg-emerald-400' : 'bg-red-500';
  const phoneDot = phoneOnline ? 'bg-emerald-400' : 'bg-red-500';

  const pcLabel = pcSyncingRealtime ? t('syncing') : pcOnlineRealtime ? t('online') : t('offline');
  const phoneLabel = phoneOnline ? t('online') : t('offline');

  return (
    <div className="glass flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 font-medium">
          <span className={`h-2.5 w-2.5 rounded-full ${pcDot}`} />
          💻 PC Tester: {pcLabel}
        </span>
        <span className="flex items-center gap-2 font-medium">
          <span className={`h-2.5 w-2.5 rounded-full ${phoneDot}`} />
          📱 Phone Tester: {phoneLabel}
        </span>
      </div>
      
      {!pcOnlineRealtime && (
        <span className="text-white/50 text-xs max-w-xs">
          {t('startHint')}
        </span>
      )}
      
      {r?.working != null && (
        <span className="text-white/60 ml-auto border-l border-white/10 pl-6 py-1">
          {t('lastSync')}: {t('live', { count: r.working })}
          {r.deleted ? ` · −${r.deleted}` : ''}
        </span>
      )}
    </div>
  );
}
