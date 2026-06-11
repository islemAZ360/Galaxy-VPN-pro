'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useWorkerPresence() {
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('worker_presence');

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const workerData = state['worker']?.[0] as any;
        
        if (workerData) {
          setOnline(true);
          setSyncing(workerData.state === 'syncing');
        } else {
          setOnline(false);
          setSyncing(false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { online, syncing };
}
