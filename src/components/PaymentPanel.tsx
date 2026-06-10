'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/routing';
import type { Plan, NetworkType } from '@/lib/plans';

// Compress an image file to a JPEG data-URL (<= maxW px, given quality).
function compressImage(file: File, maxW = 1100, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no canvas'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PaymentPanel({
  plan,
  net,
  amountLabel,
}: {
  plan: Plan;
  net: NetworkType;
  amountLabel: string;
}) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variant = plan[net];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setReceipt(await compressImage(file));
      setError(null);
    } catch {
      setError(t('error'));
    }
  }

  async function submit() {
    if (!receipt) {
      setError(t('noReceipt'));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }

    // 1) pending subscription (carries the chosen network type)
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan: plan.id,
        server_count: variant.serverCount,
        price_rub: variant.priceRub,
        duration_days: plan.durationDays,
        status: 'pending',
        network_type: net,
      })
      .select('id')
      .single();
    if (subErr || !sub) {
      setBusy(false);
      setError(t('error'));
      return;
    }

    // 2) pending payment with the receipt
    const { error: payErr } = await supabase.from('payments').insert({
      user_id: user.id,
      subscription_id: sub.id,
      plan: plan.id,
      amount_rub: variant.priceRub,
      receipt_base64: receipt,
      status: 'pending',
    });
    if (payErr) {
      setBusy(false);
      setError(t('error'));
      return;
    }

    router.replace('/profile');
    router.refresh();
  }

  return (
    <div className="glass p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-sm uppercase tracking-wide text-white/60">{amountLabel}</span>
        <span className="text-2xl font-bold">
          {variant.priceRub} <span className="text-base text-white/70">₽</span>
        </span>
      </div>
      <div className="mt-1 text-xs text-white/60">
        {net === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi'} ·  {variant.serverCount} servers
      </div>

      {/* Payment QR */}
      <div className="mt-5 flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qr.jpg"
          alt={t('qrHint')}
          className="h-44 w-44 rounded-xl bg-white p-2"
        />
        <p className="mt-2 text-center text-xs text-white/50">{t('qrHint')}</p>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-semibold">{t('sberTitle')}</h3>
        <p className="mt-1 text-sm text-white/70">{t('sberInstruction')}</p>
      </div>

      {/* Receipt upload */}
      <div className="mt-5">
        <label className="text-sm font-medium">{t('uploadLabel')}</label>
        {receipt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={receipt} alt="receipt" className="mt-2 max-h-48 rounded-lg border border-white/10" />
        )}
        <label className="mt-2 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm hover:bg-white/5">
          {receipt ? t('change') : t('choose')}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-galaxy-primary px-4 py-3 font-medium hover:opacity-90 disabled:opacity-60"
      >
        {busy ? t('submitting') : t('submit')}
      </button>
    </div>
  );
}
