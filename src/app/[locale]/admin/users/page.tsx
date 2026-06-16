import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { PaymentReview } from '@/components/admin/PaymentReview';
import { UserRow } from '@/components/admin/UserRow';

export const dynamic = 'force-dynamic';

export type SubData = { id: string; end_at: string | null; plan: number | null; network: 'wifi' | 'lte' | 'gemini' | null; server_count: number | null; active_ip_count: number; status: string; created_at: string; };

type Device = {
  subscription_id: string;
  ip_address: string;
  device_type: string;
  last_seen_at: string;
};

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { admin } = await requireAdmin(locale);
  const tp = await getTranslations('admin.payments');
  const tu = await getTranslations('admin.users');

  const { data: payments } = await admin
    .from('payments')
    .select('id, amount_rub, plan, receipt_base64, user_id, users!payments_user_id_fkey(email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const { data: users } = await admin
    .from('users')
    .select('id, email, role, banned_until, created_at')
    .order('created_at', { ascending: false });

  const { data: subs } = await admin
    .from('subscriptions')
    .select('id, user_id, end_at, plan, network_type, server_count, created_at, status')
    .order('created_at', { ascending: false });

  const { data: devicesData } = await admin
    .from('sub_devices')
    .select('subscription_id, ip_address, device_type, last_seen_at')
    .order('last_seen_at', { ascending: false });
  
  const allDevices: Device[] = devicesData ?? [];

  // All subscriptions per user
  const userSubs = new Map<string, SubData[]>();
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  
  for (const s of subs ?? []) {
    if (!userSubs.has(s.user_id)) userSubs.set(s.user_id, []);
    
    // Calculate active IP count for this sub
    const subDevices = allDevices.filter(d => d.subscription_id === s.id);
    const recentIps = new Set(
      subDevices
        .filter(d => new Date(d.last_seen_at).getTime() > oneDayAgoMs)
        .map(d => d.ip_address)
    );
    
    userSubs.get(s.user_id)!.push({
      id: s.id,
      end_at: s.end_at,
      plan: s.plan,
      network: (s.network_type as 'wifi' | 'lte' | 'gemini' | null) ?? null,
      server_count: s.server_count,
      active_ip_count: recentIps.size,
      status: s.status,
      created_at: s.created_at,
    });
  }

  return (
    <div className="space-y-10">
      {/* Pending payments */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <span className="h-5 w-1 rounded-full bg-amber-400/80" />
          {tp('title')}
        </h2>
        {!payments || payments.length === 0 ? (
          <p className="glass p-6 text-center text-sm text-white/50">{tp('none')}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {payments.map((p) => (
              <PaymentReview
                key={p.id}
                paymentId={p.id}
                email={(p.users as unknown as { email: string } | null)?.email ?? '—'}
                amount={p.amount_rub}
                plan={p.plan}
                receipt={p.receipt_base64}
              />
            ))}
          </div>
        )}
      </section>

      {/* Users — one card per user with all admin tools inline */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <span className="h-5 w-1 rounded-full bg-galaxy-accent/80" />
          {tu('title')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(users ?? []).map((u) => {
            return (
              <UserRow
                key={u.id}
                userId={u.id}
                email={u.email}
                role={u.role}
                bannedUntil={u.banned_until}
                subscriptions={userSubs.get(u.id) ?? []}
                allDevices={allDevices}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
