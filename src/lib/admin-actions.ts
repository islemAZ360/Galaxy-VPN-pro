'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const DAY = 86_400_000;

// Verify the caller is the admin. Returns the admin's user id, throws otherwise.
async function assertAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthorized');
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') throw new Error('forbidden');
  return user.id;
}

export async function approvePayment(paymentId: string, message: string) {
  const adminId = await assertAdmin();
  const admin = createAdminClient();

  const { data: pay } = await admin
    .from('payments')
    .select('id, subscription_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (!pay) throw new Error('payment not found');

  if (pay.subscription_id) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('duration_days')
      .eq('id', pay.subscription_id)
      .maybeSingle();
    const days = sub?.duration_days ?? 30;
    const start = new Date();
    const end = new Date(start.getTime() + days * DAY);
    await admin
      .from('subscriptions')
      .update({ status: 'active', start_at: start.toISOString(), end_at: end.toISOString() })
      .eq('id', pay.subscription_id);
  }

  await admin
    .from('payments')
    .update({
      status: 'approved',
      admin_message: message || null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  revalidatePath('/', 'layout');
}

export async function rejectPayment(paymentId: string, message: string) {
  const adminId = await assertAdmin();
  const admin = createAdminClient();

  const { data: pay } = await admin
    .from('payments')
    .select('subscription_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (pay?.subscription_id) {
    await admin.from('subscriptions').update({ status: 'rejected' }).eq('id', pay.subscription_id);
  }
  await admin
    .from('payments')
    .update({
      status: 'rejected',
      admin_message: message || null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  revalidatePath('/', 'layout');
}

export async function banUser(userId: string, days = 30) {
  await assertAdmin();
  const admin = createAdminClient();
  const until = new Date(Date.now() + days * DAY).toISOString();
  await admin.from('users').update({ banned_until: until }).eq('id', userId);
  revalidatePath('/', 'layout');
}

export async function unbanUser(userId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from('users').update({ banned_until: null }).eq('id', userId);
  revalidatePath('/', 'layout');
}

// Extend (or reactivate) the user's most recent subscription by N days.
export async function extendSubscription(userId: string, days = 30) {
  await assertAdmin();
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, end_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return;
  const base = sub.end_at && new Date(sub.end_at).getTime() > Date.now() ? new Date(sub.end_at) : new Date();
  const end = new Date(base.getTime() + days * DAY);
  await admin
    .from('subscriptions')
    .update({ status: 'active', start_at: sub.end_at ?? new Date().toISOString(), end_at: end.toISOString() })
    .eq('id', sub.id);
  revalidatePath('/', 'layout');
}

export async function deleteUser(userId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  // removes auth user; public.users (and its rows) cascade via FK
  await admin.auth.admin.deleteUser(userId);
  revalidatePath('/', 'layout');
}
