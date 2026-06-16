'use client';

import { useState, useTransition, useEffect } from 'react';
import { toggleBalanceMode } from '@/lib/admin-actions';
import { Scale } from 'lucide-react';

export function BalanceToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const handleToggle = () => {
    const newState = !enabled;
    setEnabled(newState);
    startTransition(async () => {
      await toggleBalanceMode(newState);
    });
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`relative inline-flex h-7 items-center rounded-full border px-2 py-1 text-xs font-semibold transition-all ${
        enabled
          ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
          : 'border-white/20 bg-white/5 text-white/60 hover:bg-white/10'
      }`}
      title={enabled ? 'Balance Mode Active' : 'Balance Mode Disabled'}
    >
      <div className="flex items-center gap-1.5">
        <Scale className={`h-3.5 w-3.5 ${enabled ? 'animate-pulse' : ''}`} />
        <span>Balance Mode {enabled ? 'ON' : 'OFF'}</span>
      </div>
    </button>
  );
}
