'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { PLANS, type NetworkType } from '@/lib/plans';
import { generateGgselCodes, exportGgselBatch, deleteGgselBatch } from '@/lib/ggsel-actions';
import { Ticket, Download, Trash2, Sparkles } from 'lucide-react';

type Batch = {
  batch_id: string;
  plan: number;
  network_type: string;
  created_at: string;
  total: number;
  redeemed: number;
};

const NET: Record<string, { label: string; cls: string }> = {
  gemini: { label: '✨ Gemini / LTE / Wi-Fi', cls: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300' },
  lte: { label: '📶 LTE / Wi-Fi', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  wifi: { label: '📡 Wi-Fi', cls: 'border-galaxy-accent/30 bg-galaxy-accent/10 text-galaxy-accent' },
};
const netBadge = (t: string) => NET[t] ?? NET.wifi;
const planLabel = (id: number) => {
  const p = PLANS.find((x) => x.id === id);
  return p ? `Plan #${id} · ${p.durationDays}d` : `Plan #${id}`;
};

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function GgselManager({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [plan, setPlan] = useState<number>(PLANS[0].id);
  const [net, setNet] = useState<NetworkType>('wifi');
  const [qty, setQty] = useState('1000');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const variant = PLANS.find((p) => p.id === plan)?.[net];

  const generate = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await generateGgselCodes(plan, net, Number(qty));
      if ('error' in res) {
        setMsg({ type: 'err', text: `Generation failed: ${res.error}` });
      } else {
        setMsg({ type: 'ok', text: `✓ Generated ${res.count} codes for ${planLabel(plan)} · ${netBadge(net).label}. Export the .txt and upload it to the matching GGSel product.` });
        router.refresh();
      }
    });
  };

  const doExport = (b: Batch, fmt: 'txt' | 'csv') => {
    setExporting(b.batch_id + fmt);
    startTransition(async () => {
      const res = await exportGgselBatch(b.batch_id);
      setExporting(null);
      if ('error' in res) {
        setMsg({ type: 'err', text: `Export failed: ${res.error}` });
        return;
      }
      const stamp = b.created_at.slice(0, 10);
      const base = `ggsel_${b.network_type}_plan${b.plan}_${stamp}_${b.batch_id.slice(0, 8)}`;
      if (fmt === 'txt') {
        // pure codes, one per line — ready to upload to GGSel
        downloadFile(`${base}.txt`, res.codes.map((c) => c.code).join('\n') + '\n', 'text/plain');
      } else {
        const csv = res.codes.map((c) => `${c.code},${c.status},${c.redeemed_at ?? ''}`).join('\n');
        downloadFile(`${base}.csv`, csv + '\n', 'text/csv');
      }
    });
  };

  const remove = (b: Batch) => {
    if (!confirm(`Delete this whole batch of ${b.total} codes? Codes already given to buyers will stop working.`)) return;
    startTransition(async () => {
      const res = await deleteGgselBatch(b.batch_id);
      if ('error' in res) setMsg({ type: 'err', text: `Delete failed: ${res.error}` });
      else router.refresh();
    });
  };

  const inputCls = 'rounded-lg border border-white/15 bg-galaxy-surface px-3 py-2 text-sm';

  return (
    <div className="space-y-5">
      {/* Generator */}
      <div className="admin-panel p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ggsel.png" alt="GGSel" className="h-7 w-7 object-contain" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">GGSel Codes</h2>
            <p className="mt-0.5 text-sm text-white/55">
              Generate a batch of codes for one product, export the .txt, and upload it to the matching GGSel product.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-white/55">
            Plan
            <select value={plan} onChange={(e) => setPlan(Number(e.target.value))} className={inputCls}>
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>{planLabel(p.id)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            Network
            <select value={net} onChange={(e) => setNet(e.target.value as NetworkType)} className={inputCls}>
              <option value="wifi">📡 Wi-Fi</option>
              <option value="lte">📶 LTE / Wi-Fi</option>
              <option value="gemini">✨ Gemini / LTE / Wi-Fi</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            Quantity
            <input type="number" min={1} max={5000} value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} w-28`} />
          </label>
          <button
            onClick={generate}
            disabled={isPending}
            className="btn-primary !px-6 !py-2.5 !text-sm disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.4} />
            {isPending ? 'Working…' : 'Generate'}
          </button>
          {variant && (
            <span className="ms-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
              This product sells for <span className="font-semibold text-white/85">{variant.priceRub} ₽</span> · {variant.serverCount} servers
            </span>
          )}
        </div>

        {msg && (
          <p className={`mt-4 rounded-lg border p-3 text-sm ${msg.type === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
            {msg.text}
          </p>
        )}
      </div>

      {/* Batches */}
      <div className="admin-panel p-5 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/45">Generated batches</h3>
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Ticket className="h-8 w-8 text-white/20" />
            <p className="text-sm text-white/45">No batches yet — generate your first batch above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((b) => {
              const nb = netBadge(b.network_type);
              const remaining = b.total - b.redeemed;
              const pct = b.total ? Math.round((b.redeemed / b.total) * 100) : 0;
              return (
                <div key={b.batch_id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/15">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-semibold text-white/90">{planLabel(b.plan)}</span>
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${nb.cls}`}>{nb.label}</span>
                    <span className="font-mono text-xs text-white/35">#{b.batch_id.slice(0, 8)}</span>
                    <span className="text-xs text-white/40" suppressHydrationWarning>{new Date(b.created_at).toLocaleString()}</span>
                    <div className="ms-auto flex items-center gap-2">
                      <button onClick={() => doExport(b, 'txt')} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-galaxy-accent/40 bg-galaxy-accent/10 px-2.5 py-1.5 text-xs font-medium text-galaxy-accent transition hover:bg-galaxy-accent/20 disabled:opacity-50">
                        <Download className="h-3.5 w-3.5" /> {exporting === b.batch_id + 'txt' ? '…' : '.txt'}
                      </button>
                      <button onClick={() => doExport(b, 'csv')} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 disabled:opacity-50">
                        <Download className="h-3.5 w-3.5" /> {exporting === b.batch_id + 'csv' ? '…' : '.csv'}
                      </button>
                      <button onClick={() => remove(b)} disabled={isPending} className="rounded-lg border border-red-500/40 p-1.5 text-red-300 transition hover:bg-red-500/10 disabled:opacity-50" title="Delete batch">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
                      <div className="h-full rounded-full bg-gradient-to-r from-galaxy-accent to-violet-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-white/55">
                      <span className="font-semibold text-emerald-300">{remaining}</span> left · {b.redeemed} used · {b.total} total
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
