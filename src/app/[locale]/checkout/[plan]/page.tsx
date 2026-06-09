import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/plans';
import { PaymentPanel } from '@/components/PaymentPanel';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string; plan: string }>;
}) {
  const { locale, plan: planParam } = await params;
  setRequestLocale(locale);

  const plan = getPlan(Number(planParam));
  if (!plan) notFound();

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
              {plan.priceRub} <span className="text-base text-white/70">₽</span>
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>✦ {tp('servers', { count: plan.serverCount })}</li>
            <li>✦ {tp('share')}</li>
          </ul>
        </div>

        {/* Payment + receipt */}
        <PaymentPanel plan={plan} amountLabel={t('amount')} />
      </div>
    </div>
  );
}
