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

  const netLabel = net === 'gemini' ? '✨ LTE / Wi-Fi / Gemini' : net === 'lte' ? '📶 LTE / Wi-Fi' : '📡 Wi-Fi';

  return (
    <div className="mx-auto max-w-4xl pt-12">
      <div className="flex items-center gap-3">
        <span className="h-8 w-1 rounded-full bg-gradient-to-b from-galaxy-primary to-galaxy-accent" />
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Order summary */}
        <div className="glass relative h-fit overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-galaxy-primary/10 blur-3xl" />
          <h2 className="relative text-xs font-bold uppercase tracking-widest text-white/50">{t('summary')}</h2>

          <div className="relative mt-4 flex items-baseline justify-between border-b border-white/10 pb-4">
            <span className="text-lg font-semibold">{tp(`duration.${plan.durationKey}`)}</span>
            <span className="text-3xl font-extrabold tracking-tight">
              {variant.priceRub}
              <span className="ms-1 text-base font-normal text-white/60">₽</span>
            </span>
          </div>

          <div className="relative mt-4">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium">
              {netLabel}
            </span>
          </div>

          <ul className="relative mt-4 space-y-2.5 text-sm text-white/80">
            <li className="flex items-center gap-2"><span className="text-galaxy-accent">✦</span> {tp('servers', { count: variant.serverCount })}</li>
            <li className="flex items-center gap-2"><span className="text-galaxy-accent">✦</span> {tp('share')}</li>
          </ul>
        </div>

        {/* Payment + receipt */}
        <PaymentPanel plan={plan} net={net} amountLabel={t('amount')} />
      </div>
    </div>
  );
}
