'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, isNetworkType, type NetworkType } from '@/lib/plans';
import { revalidatePath } from 'next/cache';

export async function submitManualPayment(
  planId: number,
  netType: NetworkType,
  receiptBase64: string
): Promise<{ ok: true } | { error: string }> {
  // 1. Authenticate user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  if (!receiptBase64) return { error: 'noReceipt' };
  
  // 2. Validate Plan & Network securely on the SERVER
  const plan = getPlan(planId);
  if (!plan) return { error: 'invalid_plan' };
  if (!isNetworkType(netType)) return { error: 'invalid_network' };
  const variant = plan[netType];

  // 3. Use Admin Client to bypass RLS (since we'll lock down public inserts)
  const admin = createAdminClient();

  // 4. Create Pending Subscription
  const { data: sub, error: subErr } = await admin
    .from('subscriptions')
    .insert({
      user_id: user.id,
      plan: plan.id,
      server_count: variant.serverCount,
      price_rub: variant.priceRub,
      duration_days: plan.durationDays,
      status: 'pending', // FORCED on the server!
      network_type: netType,
    })
    .select('id')
    .single();

  if (subErr || !sub) {
    return { error: 'server_error' };
  }

  // 5. Create Pending Payment
  const { error: payErr } = await admin.from('payments').insert({
    user_id: user.id,
    subscription_id: sub.id,
    plan: plan.id,
    amount_rub: variant.priceRub,
    receipt_base64: receiptBase64,
    status: 'pending', // FORCED on the server!
  });

  if (payErr) {
    // Optional: rollback the pending sub if payment failed
    await admin.from('subscriptions').delete().eq('id', sub.id);
    return { error: 'server_error' };
  }

  revalidatePath('/profile');
  return { ok: true };
}
