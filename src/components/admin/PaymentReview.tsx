'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { approvePayment, rejectPayment } from '@/lib/admin-actions';

export function PaymentReview({
  paymentId,
  email,
  amount,
  plan,
  receipt,
}: {
  paymentId: string;
  email: string;
  amount: number;
  plan: number;
  receipt: string;
}) {
  const t = useTranslations('admin.payments');
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(false);
  const [isPending, startTransition] = useTransition();

  const act = (fn: (id: string, msg: string) => Promise<void>) =>
    startTransition(async () => {
      await fn(paymentId, message);
      router.refresh();
    });

  return (
    <div className="glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{email}</div>
          <div className="text-sm text-white/60">
            {t('plan')} #{plan} · {t('amount')}: {amount} ₽
          </div>
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={receipt}
        alt={t('receipt')}
        onClick={() => setZoom((z) => !z)}
        className={`mt-3 cursor-zoom-in rounded-lg border border-white/10 ${zoom ? 'max-h-[80vh]' : 'max-h-44'}`}
      />

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('messagePlaceholder')}
        rows={2}
        className="mt-3 w-full rounded-lg border border-white/15 bg-galaxy-surface px-3 py-2 text-sm"
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => act(approvePayment)}
          disabled={isPending}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {t('approve')}
        </button>
        <button
          onClick={() => act(rejectPayment)}
          disabled={isPending}
          className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {t('reject')}
        </button>
      </div>
    </div>
  );
}
