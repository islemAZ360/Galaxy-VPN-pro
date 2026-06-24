'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

let globalPcOnline = false;
let globalPcSyncing = false;
let globalPhoneOnline = false;
let globalPhoneSyncing = false;
let listeners = new Set<(pcOnline: boolean, pcSyncing: boolean, phoneOnline: boolean, phoneSyncing: boolean) => void>();
let isSubscribed = false;

const DB_ONLINE_MS = 25_000;
const DB_POLL_MS = 5_000;

function applyState(pcO: boolean, pcS: boolean, phoneO: boolean, phoneS: boolean) {
  globalPcOnline = pcO;
  globalPcSyncing = pcS;
  globalPhoneOnline = phoneO;
  globalPhoneSyncing = phoneS;
  listeners.forEach((l) => l(pcO, pcS, phoneO, phoneS));
}

function initPresence() {
  if (isSubscribed) return;
  isSubscribed = true;

  const supabase = createClient();
  
  const existing = supabase.getChannels().find(c => c.topic === 'realtime:worker_presence');
  if (existing) {
    supabase.removeChannel(existing);
  }

  const channel = supabase.channel('worker_presence');

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      
      const workerData = state['worker']?.[0] as any;
      const presencePcOnline = !!workerData;
      const presencePcSyncing = workerData?.state === 'syncing';
      
      const phoneData = state['phone-worker']?.[0] as any;
      const presencePhoneOnline = !!phoneData;
      const presencePhoneSyncing = phoneData?.state === 'syncing';
      
      applyState(
        presencePcOnline || globalPcOnline, 
        presencePcOnline ? presencePcSyncing : globalPcSyncing,
        presencePhoneOnline || globalPhoneOnline,
        presencePhoneOnline ? presencePhoneSyncing : globalPhoneSyncing
      );
    })
    .subscribe();

  // DB heartbeat fallback
  const pollDb = async () => {
    try {
      const { data } = await supabase
        .from('worker_status')
        .select('id, state, last_seen')
        .in('id', ['worker', 'phone-worker']);
        
      if (data) {
        const now = Date.now();
        let newPcOnline = globalPcOnline;
        let newPcSyncing = globalPcSyncing;
        let newPhoneOnline = globalPhoneOnline;
        let newPhoneSyncing = globalPhoneSyncing;
        
        for (const row of data) {
          if (!row.last_seen) continue;
          const age = now - new Date(row.last_seen).getTime();
          const isAliveDb = age < DB_ONLINE_MS;
          
          if (row.id === 'worker') {
            if (isAliveDb) {
              newPcOnline = true;
              newPcSyncing = row.state === 'syncing' || globalPcSyncing;
            } else {
              // Only DB is dead; presence channel might still be alive
            }
          } else if (row.id === 'phone-worker') {
            if (isAliveDb) {
              newPhoneOnline = true;
              newPhoneSyncing = row.state === 'syncing' || globalPhoneSyncing;
            }
          }
        }
        
        // Also if we have NO realtime data, we should allow DB to timeout
        // But doing it here might conflict with the realtime websocket if it's connected but quiet.
        // Usually, presence channel removes itself on disconnect. So we just update if DB says ALIVE.
        
        applyState(newPcOnline, newPcSyncing, newPhoneOnline, newPhoneSyncing);
      }
    } catch { /* ignore */ }
  };
  pollDb();
  setInterval(pollDb, DB_POLL_MS);
}

export function useWorkerPresence() {
  const [pcOnline, setPcOnline] = useState(globalPcOnline);
  const [pcSyncing, setPcSyncing] = useState(globalPcSyncing);
  const [phoneOnline, setPhoneOnline] = useState(globalPhoneOnline);
  const [phoneSyncing, setPhoneSyncing] = useState(globalPhoneSyncing);

  useEffect(() => {
    initPresence();

    const listener = (pcO: boolean, pcS: boolean, phoneO: boolean, phoneS: boolean) => {
      setPcOnline(pcO);
      setPcSyncing(pcS);
      setPhoneOnline(phoneO);
      setPhoneSyncing(phoneS);
    };

    listeners.add(listener);
    setPcOnline(globalPcOnline);
    setPcSyncing(globalPcSyncing);
    setPhoneOnline(globalPhoneOnline);
    setPhoneSyncing(globalPhoneSyncing);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { pcOnline, pcSyncing, phoneOnline, phoneSyncing };
}
