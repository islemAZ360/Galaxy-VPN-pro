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
    <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <Scale className={`h-4 w-4 transition-colors duration-300 ${enabled ? 'text-emerald-400' : 'text-white/40'}`} />
        <span className={`text-[13px] font-semibold tracking-wide transition-colors duration-300 ${enabled ? 'text-emerald-300' : 'text-white/50'}`}>
          Balance
        </span>
      </div>
      
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={handleToggle}
        disabled={isPending}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-galaxy-bg ${
          enabled ? 'bg-emerald-500' : 'bg-white/20'
        } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="sr-only">Toggle Balance Mode</span>
        <span
          className={`pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        >
          <span
            className={`absolute inset-0 flex h-full w-full items-center justify-center transition-opacity duration-300 ease-in-out ${
              enabled ? 'opacity-0' : 'opacity-100'
            }`}
            aria-hidden="true"
          >
            <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 12 12">
              <path d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span
            className={`absolute inset-0 flex h-full w-full items-center justify-center transition-opacity duration-300 ease-in-out ${
              enabled ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden="true"
          >
            <svg className="h-3 w-3 text-emerald-500" fill="currentColor" viewBox="0 0 12 12">
              <path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z" />
            </svg>
          </span>
        </span>
      </button>
    </div>
  );
}
