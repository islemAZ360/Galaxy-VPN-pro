'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { Ticket } from 'lucide-react';
import { redeemGgselCode } from '@/lib/ggsel-actions';
import type { NetworkType } from '@/lib/plans';

const ERRORS: Record<string, string> = {
  empty: 'Please enter your code.',
  invalid: 'Code not found — double-check it and try again.',
  used: 'This code has already been used.',
  mismatch: 'This code is for a different subscription. Select the exact plan you bought on GGSel.',
  unauthorized: 'Please log in first.',
  failed: 'Activation failed — please try again.',
};

const netName = (net: NetworkType) =>
  net === 'gemini' ? 'Gemini / LTE / Wi-Fi' : net === 'lte' ? 'LTE / Wi-Fi' : 'Wi-Fi';

export function GgselRedeem({ plan, net }: { plan: number; net: NetworkType }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const redeem = () => {
    if (!code.trim()) return;
    setErr(null);
    startTransition(async () => {
      const res = await redeemGgselCode(code, plan, net);
      if ('ok' in res) {
        router.replace('/profile');
        router.refresh();
      } else {
        setErr(ERRORS[res.error] ?? 'Something went wrong.');
      }
    });
  };

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-start transition-colors hover:bg-white/[0.04]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500/30 to-amber-500/20 ring-1 ring-white/10">
          <Ticket className="h-5 w-5 text-amber-300" strokeWidth={2.2} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Bought on GGSel?</span>
          <span className="block text-xs text-white/55">Enter your code to activate instantly — no receipt needed.</span>
        </span>
        <span className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-white/10 p-5">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && redeem()}
            placeholder="GG-XXXX-XXXX-XXXX-XXXX"
            dir="ltr"
            className="w-full rounded-xl border border-white/15 bg-galaxy-surface px-4 py-3 text-center font-mono uppercase tracking-widest outline-none focus:border-galaxy-accent/50"
          />
          {err && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-300">{err}</p>
          )}
          <button
            onClick={redeem}
            disabled={isPending || !code.trim()}
            className="btn-primary mt-4 w-full disabled:opacity-60"
          >
            {isPending ? 'Activating…' : 'Activate subscription'}
          </button>
          <p className="mt-3 text-center text-xs text-white/40">
            The code must match this exact plan ({netName(net)}).
          </p>
        </div>
      )}
    </div>
  );
}
