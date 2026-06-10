import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { getPlan, isNetworkType, type NetworkType } from '@/lib/plans';
import { PaymentPanel } from '@/components/PaymentPanel';

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; plan: string }>;
  searchParams: Promise<{ net?: string }>;
}) {
  const { locale, plan: planParam } = await params;
  const { net: netParam } = await searchParams;
  setRequestLocale(locale);

  const plan = getPlan(Number(planParam));
  if (!plan) notFound();
  const net: NetworkType = isNetworkType(netParam) ? netParam : 'wifi';
  const variant = plan[net];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const t = await getTranslations('checkout');
  const tp = await getTranslations('plans');

  return (
    <div className="mx-auto max-w-4xl pt-12">
      <h1 className="text-3xl font-bold">{t('title')}</h1>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Order summary */}
        <div className="glass p-6">
          <h2 className="text-sm uppercase tracking-wide text-white/60">{t('summary')}</h2>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-lg font-medium">{tp(`duration.${plan.durationKey}`)}</span>
            <span className="text-2xl font-bold">
              {variant.priceRub} <span className="text-base text-white/70">₽</span>
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>{net === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi'}</li>
            <li>✦ {tp('servers', { count: variant.serverCount })}</li>
            <li>✦ {tp('share')}</li>
          </ul>
        </div>

        {/* Payment + receipt */}
        <PaymentPanel plan={plan} net={net} amountLabel={t('amount')} />
      </div>
    </div>
  );
}
