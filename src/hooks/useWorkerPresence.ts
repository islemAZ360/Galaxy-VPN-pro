'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

let rtPcOnline = false;
let rtPcSyncing = false;
let dbPcOnline = false;
let dbPcSyncing = false;

let rtPhoneOnline = false;
let rtPhoneSyncing = false;
let dbPhoneOnline = false;
let dbPhoneSyncing = false;

let listeners = new Set<(pcOnline: boolean, pcSyncing: boolean, phoneOnline: boolean, phoneSyncing: boolean) => void>();
let isSubscribed = false;

const DB_ONLINE_MS = 25_000;
const DB_POLL_MS = 5_000;

function evaluateState() {
  const pcO = rtPcOnline || dbPcOnline;
  const pcS = rtPcOnline ? rtPcSyncing : dbPcSyncing;
  const phoneO = rtPhoneOnline || dbPhoneOnline;
  const phoneS = rtPhoneOnline ? rtPhoneSyncing : dbPhoneSyncing;
  
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
      rtPcOnline = !!workerData;
      rtPcSyncing = workerData?.state === 'syncing';
      
      const phoneData = state['phone-worker']?.[0] as any;
      rtPhoneOnline = !!phoneData;
      rtPhoneSyncing = phoneData?.state === 'syncing';
      
      evaluateState();
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
        
        for (const row of data) {
          if (!row.last_seen) continue;
          const age = now - new Date(row.last_seen).getTime();
          const isAliveDb = age < DB_ONLINE_MS;
          
          if (row.id === 'worker') {
            dbPcOnline = isAliveDb && row.state !== 'offline';
            dbPcSyncing = row.state === 'syncing';
          } else if (row.id === 'phone-worker') {
            dbPhoneOnline = isAliveDb && row.state !== 'offline';
            dbPhoneSyncing = row.state === 'syncing';
          }
        }
        
        evaluateState();
      }
    } catch { /* ignore */ }
  };
  pollDb();
  setInterval(pollDb, DB_POLL_MS);
}

export function useWorkerPresence() {
  const [pcOnline, setPcOnline] = useState(rtPcOnline || dbPcOnline);
  const [pcSyncing, setPcSyncing] = useState(rtPcOnline ? rtPcSyncing : dbPcSyncing);
  const [phoneOnline, setPhoneOnline] = useState(rtPhoneOnline || dbPhoneOnline);
  const [phoneSyncing, setPhoneSyncing] = useState(rtPhoneOnline ? rtPhoneSyncing : dbPhoneSyncing);

  useEffect(() => {
    initPresence();

    const listener = (pcO: boolean, pcS: boolean, phoneO: boolean, phoneS: boolean) => {
      setPcOnline(pcO);
      setPcSyncing(pcS);
      setPhoneOnline(phoneO);
      setPhoneSyncing(phoneS);
    };

    listeners.add(listener);
    setPcOnline(rtPcOnline || dbPcOnline);
    setPcSyncing(rtPcOnline ? rtPcSyncing : dbPcSyncing);
    setPhoneOnline(rtPhoneOnline || dbPhoneOnline);
    setPhoneSyncing(rtPhoneOnline ? rtPhoneSyncing : dbPhoneSyncing);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { pcOnline, pcSyncing, phoneOnline, phoneSyncing };
}
