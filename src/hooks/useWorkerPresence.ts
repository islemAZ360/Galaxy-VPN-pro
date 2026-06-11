'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

let globalOnline = false;
let globalSyncing = false;
let listeners = new Set<(online: boolean, syncing: boolean) => void>();
let isSubscribed = false;

function initPresence() {
  if (isSubscribed) return;
  isSubscribed = true;

  const supabase = createClient();
  const channel = supabase.channel('worker_presence');

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const workerData = state['worker']?.[0] as any;
      
      globalOnline = !!workerData;
      globalSyncing = workerData?.state === 'syncing';
      
      listeners.forEach((listener) => listener(globalOnline, globalSyncing));
    })
    .subscribe();
}

export function useWorkerPresence() {
  const [online, setOnline] = useState(globalOnline);
  const [syncing, setSyncing] = useState(globalSyncing);

  useEffect(() => {
    initPresence();

    const listener = (o: boolean, s: boolean) => {
      setOnline(o);
      setSyncing(s);
    };

    listeners.add(listener);
    setOnline(globalOnline);
    setSyncing(globalSyncing);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { online, syncing };
}
