'use client';

import { useTransition } from 'react';
import { testLatency } from '@/app/[locale]/admin/servers/actions';

export function TestLatencyButton({ 
  isLive, 
  isBusy, 
  label 
}: { 
  isLive: boolean; 
  isBusy: boolean; 
  label: string; 
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLive) {
      alert("⚠️ Worker is offline!\nPlease start the Python worker script first.");
      return;
    }
    if (isBusy) {
      alert("⏳ Worker is already busy syncing.\nPlease wait for it to finish.");
      return;
    }

    startTransition(async () => {
      try {
        await testLatency();
        alert("✅ Latency test requested!\nThe worker will now ping all servers.");
      } catch (err: any) {
        alert(`❌ Error requesting latency test: ${err.message}`);
      }
    });
  }

  return (
    <button 
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`rounded-md border border-blue-500/50 bg-blue-500/20 px-2 py-1 text-blue-400 hover:bg-blue-500/30 transition ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {isPending ? '...' : label}
    </button>
  );
}
