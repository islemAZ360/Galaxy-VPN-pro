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

export async function banUser(userId: string, durationMs: number = 30 * DAY) {
  await assertAdmin();
  const admin = createAdminClient();
  const until = new Date(Date.now() + durationMs).toISOString();
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
  networkType: 'wifi' | 'lte' | 'gemini' = 'lte',
  customServerCount?: number
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
    // No subscription yet → create an admin-granted one matching the duration.
    const days = ms / DAY;
    let planId = 1;
    if (days >= 365) planId = 4;
    else if (days >= 180) planId = 3;
    else if (days >= 90) planId = 2;
    else planId = 1;

    const plan = getPlan(planId)!;
    await admin.from('subscriptions').insert({
      user_id: userId,
      plan: plan.id,
      network_type: networkType,
      server_count: customServerCount && customServerCount > 0 ? customServerCount : plan[networkType].serverCount,
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
          network_type: networkType,
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

export async function toggleRepoStatus(id: string, enabled: boolean) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from('repos').update({ enabled }).eq('id', id);
  revalidatePath('/', 'layout');
}

// Request a fresh sync — inserts a row into sync_requests; the local Tester
// Worker picks it up over Supabase Realtime, runs the real test, and updates
// the live server pool.
export async function requestSync(kind: 'wifi' | 'lte' | 'whitelist' = 'wifi', percentage: number = 100, detailsPercentage: number = 100) {
  const adminId = await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sync_requests')
    .insert({ requested_by: adminId, kind, percentage, details_percentage: detailsPercentage })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

// ---- GitHub Actions Integration ----
export async function triggerGithubScan(percentage: number = 100) {
  try {
    await assertAdmin();
    const token = process.env.GITHUB_TOKEN?.trim();
    if (!token) return { error: 'GITHUB_TOKEN environment variable is not set in Vercel. Please add it to your project settings.' };

    const res = await fetch('https://api.github.com/repos/islemAZ360/Galaxy-VPN-pro/actions/workflows/liveness.yml/dispatches', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { percentage: String(percentage) }
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: `GitHub API error: ${res.status} ${text}` };
    }

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function checkGithubScanStatus() {
  await assertAdmin();
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return { isRunning: false, error: 'No GITHUB_TOKEN configured' };

  // Check for queued or in_progress runs
  const res = await fetch('https://api.github.com/repos/islemAZ360/Galaxy-VPN-pro/actions/runs?status=in_progress', {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
    },
    cache: 'no-store', // Always fetch fresh data
  });

  if (!res.ok) return { isRunning: false, error: 'Failed to fetch status from GitHub API' };

  const data = await res.json();
  const isRunning = data.workflow_runs?.some((r: any) => r.name === 'server-liveness-scan');
  return { isRunning, count: data.total_count || 0 };
}

export async function toggleBalanceMode(enabled: boolean) {
  await assertAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from('worker_status').select('last_result').eq('id', 'worker').single();
  const last_result = data?.last_result || {};
  last_result.balance_mode = enabled;
  await admin.from('worker_status').update({ last_result }).eq('id', 'worker');
  revalidatePath('/', 'layout');
}

export async function getBalanceModeStatus() {
  const admin = createAdminClient();
  const { data } = await admin.from('worker_status').select('last_result').eq('id', 'worker').single();
  return !!data?.last_result?.balance_mode;
}

// Delete specific payments (and their associated subscriptions) from the Sales Record
export async function deleteSales(paymentIds: string[]) {
  const adminId = await assertAdmin();
  const admin = createAdminClient();

  if (!paymentIds || paymentIds.length === 0) return;

  // Find associated subscriptions
  const { data: payments } = await admin.from('payments').select('subscription_id').in('id', paymentIds);
  const subIds = payments?.map(p => p.subscription_id).filter(Boolean) || [];

  // Delete payments
  await admin.from('payments').delete().in('id', paymentIds);

  // Delete associated subscriptions
  if (subIds.length > 0) {
    await admin.from('subscriptions').delete().in('id', subIds);
  }

  revalidatePath('/', 'layout');
}

const TIER_TAGS: Record<string, string> = {
  wifi: ' | WIFI',
  lte: ' | WIFI/LTE',
  gemini_wifi: ' | WIFI/GEMINI',
  gemini_lte: ' | WIFI/LTE/GEMINI',
  whitelist: ' | WIFI/LTE/WhiteList',
  gemini_whitelist: ' | WIFI/LTE/GEMINI/WhiteList',
};

function renameConfig(uri: string, name: string): string {
  const scheme = (uri.split('://')[0] || '').toLowerCase();
  try {
    if (scheme === 'vmess') {
      const json = JSON.parse(Buffer.from(uri.slice('vmess://'.length), 'base64').toString('utf8'));
      json.ps = name;
      return 'vmess://' + Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
    }
    const hashIdx = uri.indexOf('#');
    const base = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;
    return base + '#' + encodeURIComponent(name);
} catch {
    return uri;
  }
}

export async function getGlobalLimits() {
  const admin = createAdminClient();
  const { data } = await admin.from('worker_settings').select('*').eq('id', 'global').maybeSingle();
  return {
    base: data?.base_pct ?? 100,
    wifi_deep: data?.wifi_deep_pct ?? 100,
    lte_deep: data?.lte_deep_pct ?? 100,
    wl_deep: data?.wl_deep_pct ?? 100,
  };
}

export async function updateGlobalLimits(limits: { base?: number, wifi_deep?: number, lte_deep?: number, wl_deep?: number }) {
  await assertAdmin();
  const admin = createAdminClient();
  const updatePayload: Record<string, number> = {};
  if (limits.base !== undefined) updatePayload.base_pct = limits.base;
  if (limits.wifi_deep !== undefined) updatePayload.wifi_deep_pct = limits.wifi_deep;
  if (limits.lte_deep !== undefined) updatePayload.lte_deep_pct = limits.lte_deep;
  if (limits.wl_deep !== undefined) updatePayload.wl_deep_pct = limits.wl_deep;
  
  if (Object.keys(updatePayload).length > 0) {
    await admin.from('worker_settings').update(updatePayload).eq('id', 'global');
  }
}
