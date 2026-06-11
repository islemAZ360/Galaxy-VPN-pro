'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/plans';

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

// Set or add remaining time on a specific subscription.
// If subscriptionId is null, creates a new admin-granted subscription.
export async function setSubscriptionTime(
  subscriptionId: string | null, 
  userId: string, 
  ms: number, 
  mode: 'set' | 'add',
  networkType: 'wifi' | 'lte' | 'gemini' = 'lte'
) {
  await assertAdmin();
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('invalid duration');
  const admin = createAdminClient();
  const now = Date.now();

  if (subscriptionId) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('id, end_at')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (sub) {
    const base =
      mode === 'add' && sub.end_at && new Date(sub.end_at).getTime() > now
        ? new Date(sub.end_at).getTime()
        : now;
    await admin
      .from('subscriptions')
      .update({
        status: 'active',
        start_at: new Date(now).toISOString(),
        end_at: new Date(base + ms).toISOString(),
      })
      .eq('id', sub.id);
    }
  } else {
    // No subscription yet → create an admin-granted one (top plan).
    const plan = getPlan(4)!;
    await admin.from('subscriptions').insert({
      user_id: userId,
      plan: plan.id,
      network: networkType,
      server_count: plan[networkType].serverCount,
      price_rub: 0,
      duration_days: Math.max(1, Math.round(ms / DAY)),
      status: 'active',
      start_at: new Date(now).toISOString(),
      end_at: new Date(now + ms).toISOString(),
    });
    revalidatePath('/', 'layout');
  }
}

// Change the network type of a specific subscription
export async function changeSubscriptionNetwork(subscriptionId: string, networkType: 'wifi' | 'lte' | 'gemini') {
  await assertAdmin();
  const admin = createAdminClient();
  
  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, plan')
    .eq('id', subscriptionId)
    .maybeSingle();
    
  if (sub && sub.plan) {
    const plan = getPlan(sub.plan);
    if (plan) {
      await admin
        .from('subscriptions')
        .update({
          network: networkType,
          server_count: plan[networkType].serverCount,
        })
        .eq('id', sub.id);
      revalidatePath('/', 'layout');
    }
  }
}

// Delete a specific subscription
export async function deleteSubscription(subscriptionId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from('subscriptions').delete().eq('id', subscriptionId);
  revalidatePath('/', 'layout');
}

// Send a message to a user — appears in their Support chat (sender = admin).
export async function sendUserMessage(userId: string, text: string) {
  await assertAdmin();
  const body = text.trim();
  if (!body) return;
  const admin = createAdminClient();
  await admin.from('support_messages').insert({ user_id: userId, sender: 'admin', body });
  revalidatePath('/', 'layout');
}

export async function deleteUser(userId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  // removes auth user; public.users (and its rows) cascade via FK
  await admin.auth.admin.deleteUser(userId);
  revalidatePath('/', 'layout');
}

// ---- GitHub repo management (the worker reads these on its next run) ----
export async function addRepo(repoUrl: string) {
  await assertAdmin();
  const url = repoUrl.trim();
  if (!/github\.com\//i.test(url)) throw new Error('invalid github url');
  const admin = createAdminClient();
  await admin.from('repos').upsert({ repo_url: url, enabled: true }, { onConflict: 'repo_url' });
  revalidatePath('/', 'layout');
}

export async function deleteRepo(id: string) {
  await assertAdmin();
  const admin = createAdminClient();
  
  // Get the repo_url first so we can delete its stats
  const { data } = await admin.from('repos').select('repo_url').eq('id', id).single();
  
  await admin.from('repos').delete().eq('id', id);
  
  // Clean up ghost stats
  if (data?.repo_url) {
    await admin.from('repo_stats').delete().eq('repo_url', data.repo_url);
  }
  
  revalidatePath('/', 'layout');
}

// Request a fresh sync — inserts a row into sync_requests; the local Tester
// Worker picks it up over Supabase Realtime, runs the real test, and updates
// the live server pool.
export async function requestSync(kind: 'full' | 'lte' | 'gemini_wifi' | 'gemini_lte' = 'full') {
  const adminId = await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sync_requests')
    .insert({ requested_by: adminId, kind })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}
