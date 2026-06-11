'use client';

import { useState, useTransition, useEffect } from 'react';
import { testLatency } from '@/app/[locale]/admin/servers/actions';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Clock, X } from 'lucide-react';

import { useWorkerPresence } from '@/hooks/useWorkerPresence';

export function TestLatencyButton({ 
  label 
}: { 
  label: string; 
}) {
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ type: 'error' | 'success' | 'warning', message: string } | null>(null);
  const { online: isLive, syncing: isBusy } = useWorkerPresence();

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  function handleClick() {
    if (!isLive) {
      setToast({ type: 'error', message: 'Worker is offline! Please start the Python worker script first.' });
      return;
    }
    if (isBusy) {
      setToast({ type: 'warning', message: 'Worker is already busy syncing. Please wait.' });
      return;
    }

    startTransition(async () => {
      try {
        await testLatency();
        setToast({ type: 'success', message: 'Latency test requested! The worker will now ping all servers.' });
      } catch (err: any) {
        setToast({ type: 'error', message: `Error requesting latency test: ${err.message}` });
      }
    });
  }

  return (
    <>
      <button 
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-md border border-blue-500/50 bg-blue-500/20 px-2 py-1 text-blue-400 hover:bg-blue-500/30 transition ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isPending ? '...' : label}
      </button>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-full"
          >
            <div className={`p-4 rounded-xl shadow-2xl border flex items-start gap-3 backdrop-blur-xl ${
              toast.type === 'error' ? 'bg-red-950/40 border-red-500/30 text-red-200' :
              toast.type === 'warning' ? 'bg-amber-950/40 border-amber-500/30 text-amber-200' :
              'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
            }`}>
              <div className={`shrink-0 mt-0.5 ${
                toast.type === 'error' ? 'text-red-400' :
                toast.type === 'warning' ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
                {toast.type === 'warning' && <Clock className="w-5 h-5" />}
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
              </div>
              <p className="text-sm font-medium leading-relaxed flex-1">
                {toast.message}
              </p>
              <button 
                onClick={() => setToast(null)}
                className="shrink-0 p-1 -mr-2 -mt-1 opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
