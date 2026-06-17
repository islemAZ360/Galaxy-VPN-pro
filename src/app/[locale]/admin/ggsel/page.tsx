import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { GgselManager } from '@/components/admin/GgselManager';

export const dynamic = 'force-dynamic';

type Batch = {
  batch_id: string;
  plan: number;
  network_type: string;
  created_at: string;
  total: number;
  redeemed: number;
};

export default async function AdminGgselPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { admin } = await requireAdmin(locale);

  const { data } = await admin
    .from('ggsel_batches')
    .select('batch_id, plan, network_type, created_at, total, redeemed')
    .order('created_at', { ascending: false });

  const batches: Batch[] = (data ?? []).map((b) => ({
    batch_id: b.batch_id as string,
    plan: Number(b.plan),
    network_type: b.network_type as string,
    created_at: b.created_at as string,
    total: Number(b.total),
    redeemed: Number(b.redeemed),
  }));

  return <GgselManager batches={batches} />;
}
