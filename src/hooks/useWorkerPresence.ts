'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

let globalOnline = false;
let globalSyncing = false;
let listeners = new Set<(online: boolean, syncing: boolean) => void>();
let isSubscribed = false;

// The realtime presence channel is the primary online signal, but on a flaky
// VPN (LTE in Russia) the websocket drops every ~20-45s and presence clears,
// making the dashboard flicker to "Offline" even though the worker is fine.
// The worker writes a DB heartbeat (worker_status.last_seen) every 15s via the
// resilient REST path, so we poll it as a fallback: if last_seen is fresher
// than 40s we treat the worker as online regardless of the presence channel.
const DB_ONLINE_MS = 40_000;
const DB_POLL_MS = 10_000;

function applyState(online: boolean, syncing: boolean) {
  globalOnline = online;
  globalSyncing = syncing;
  listeners.forEach((l) => l(online, syncing));
}

function initPresence() {
  if (isSubscribed) return;
  isSubscribed = true;

  const supabase = createClient();
  
  // Clean up any existing channel with this name to avoid "already subscribed" errors
  // which happen when Next.js re-evaluates this module but the Supabase client is cached.
  const existing = supabase.getChannels().find(c => c.topic === 'realtime:worker_presence');
  if (existing) {
    supabase.removeChannel(existing);
  }

  const channel = supabase.channel('worker_presence');

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const workerData = state['worker']?.[0] as any;
      
      const presenceOnline = !!workerData;
      const presenceSyncing = workerData?.state === 'syncing';
      // Merge: presence wins for the syncing flag (fresher than DB); DB fallback
      // for online. Keep current DB-derived syncing if presence is empty.
      applyState(presenceOnline || globalOnline, presenceOnline ? presenceSyncing : globalSyncing);
    })
    .subscribe();

  // DB heartbeat fallback: poll worker_status.last_seen. If the realtime
  // websocket is flaky, this keeps the dot green as long as the worker is
  // actually heart-beating the DB (which it does every 15s via REST).
  const pollDb = async () => {
    try {
      const { data } = await supabase
        .from('worker_status')
        .select('state, last_seen')
        .eq('id', 'worker')
        .maybeSingle();
      if (data?.last_seen) {
        const age = Date.now() - new Date(data.last_seen).getTime();
        if (age < DB_ONLINE_MS) {
          applyState(true, data.state === 'syncing' || globalSyncing);
          return;
        }
      }
      // Stale or missing — don't force offline here; presence may still be live.
    } catch { /* ignore — presence channel is the other source */ }
  };
  pollDb();
  setInterval(pollDb, DB_POLL_MS);
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
