'use server';

import { randomBytes, randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, isNetworkType, type NetworkType } from '@/lib/plans';

const DAY = 86_400_000;
const MAX_BATCH = 5000;

// Unambiguous alphabet (no 0/O/1/I) → easy for buyers to read/type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(): string {
  const b = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `GG-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

// Verify the caller is the admin. Returns the admin's user id, throws otherwise.
async function assertAdmin(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthorized');
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') throw new Error('forbidden');
  return user.id;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ── Admin: generate a batch of codes for ONE product (plan + network) ────────
export async function generateGgselCodes(
  plan: number,
  networkType: string,
  quantity: number,
): Promise<{ ok: true; batchId: string; count: number } | { error: string }> {
  await assertAdmin();
  if (!getPlan(plan)) return { error: 'invalid plan' };
  if (!isNetworkType(networkType)) return { error: 'invalid network' };
  const qty = Math.max(1, Math.min(MAX_BATCH, Math.floor(Number(quantity) || 0)));
  if (!qty) return { error: 'invalid quantity' };

  const admin = createAdminClient();
  const batchId = randomUUID();
  const now = new Date().toISOString();

  // Generate locally-unique codes (collision across the whole table is
  // astronomically unlikely; ignoreDuplicates makes the insert safe regardless).
  const seen = new Set<string>();
  while (seen.size < qty) seen.add(genCode());
  const rows = [...seen].map((code) => ({
    code,
    plan,
    network_type: networkType,
    batch_id: batchId,
    status: 'unused',
    created_at: now,
  }));

  for (const part of chunk(rows, 500)) {
    const { error } = await admin
      .from('ggsel_codes')
      .upsert(part, { onConflict: 'code', ignoreDuplicates: true });
    if (error) return { error: error.message };
  }

  revalidatePath('/', 'layout');
  return { ok: true, batchId, count: qty };
}

// ── Admin: all codes of a batch, for .txt / .csv export ──────────────────────
export async function exportGgselBatch(
  batchId: string,
): Promise<{ ok: true; codes: { code: string; status: string; redeemed_at: string | null }[] } | { error: string }> {
  await assertAdmin();
  const admin = createAdminClient();
  const out: { code: string; status: string; redeemed_at: string | null }[] = [];
  let from = 0;
  const size = 1000;
  // paginate so very large batches still export fully
  for (;;) {
    const { data, error } = await admin
      .from('ggsel_codes')
      .select('code, status, redeemed_at')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true })
      .range(from, from + size - 1);
    if (error) return { error: error.message };
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return { ok: true, codes: out };
}

// ── Admin: delete a whole batch (e.g. a mistaken generation) ─────────────────
export async function deleteGgselBatch(batchId: string): Promise<{ ok: true } | { error: string }> {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('ggsel_codes').delete().eq('batch_id', batchId);
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ── User: redeem a code → auto-activate the matching subscription ────────────
// Anti-fraud: the code only works for the EXACT product (plan + network) it was
// generated for. The claim is an optimistic update (status must still be
// 'unused') so a code can never be redeemed twice, even under a race.
export async function redeemGgselCode(
  rawCode: string,
  plan: number,
  networkType: string,
): Promise<{ ok: true } | { error: 'unauthorized' | 'empty' | 'invalid' | 'used' | 'mismatch' | 'failed' }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const code = (rawCode || '').trim().toUpperCase();
  if (!code) return { error: 'empty' };
  if (!isNetworkType(networkType)) return { error: 'mismatch' };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('ggsel_codes')
    .select('id, plan, network_type, status')
    .eq('code', code)
    .maybeSingle();

  if (!row) return { error: 'invalid' };
  if (row.status === 'redeemed') return { error: 'used' };
  // The matching system: the code MUST be for the product the user selected.
  if (row.plan !== plan || row.network_type !== networkType) return { error: 'mismatch' };

  const p = getPlan(row.plan);
  if (!p) return { error: 'invalid' };
  const variant = p[row.network_type as NetworkType];

  // Atomically claim it (guards double-redeem).
  const { data: claimed } = await admin
    .from('ggsel_codes')
    .update({ status: 'redeemed', redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'unused')
    .select('id')
    .maybeSingle();
  if (!claimed) return { error: 'used' };

  const now = Date.now();
  const { error: subErr } = await admin.from('subscriptions').insert({
    user_id: user.id,
    plan: p.id,
    network_type: row.network_type,
    server_count: variant.serverCount,
    price_rub: variant.priceRub,
    duration_days: p.durationDays,
    status: 'active',
    start_at: new Date(now).toISOString(),
    end_at: new Date(now + p.durationDays * DAY).toISOString(),
  });

  if (subErr) {
    // Roll the code back so a failed activation doesn't burn it.
    await admin
      .from('ggsel_codes')
      .update({ status: 'unused', redeemed_by: null, redeemed_at: null })
      .eq('id', row.id);
    return { error: 'failed' };
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}
