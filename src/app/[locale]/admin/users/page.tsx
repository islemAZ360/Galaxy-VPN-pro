import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { PaymentReview } from '@/components/admin/PaymentReview';
import { UserRow } from '@/components/admin/UserRow';

export const dynamic = 'force-dynamic';

type LatestSub = { end_at: string | null; plan: number | null; network: 'wifi' | 'lte' | 'gemini' | null };

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
    .select('user_id, end_at, plan, network_type, created_at, status')
    .order('created_at', { ascending: false });

  // Latest subscription per user (any status).
  const latest = new Map<string, LatestSub>();
  for (const s of subs ?? []) {
    if (latest.has(s.user_id)) continue;
    latest.set(s.user_id, {
      end_at: s.end_at,
      plan: s.plan,
      network: (s.network_type as 'wifi' | 'lte' | 'gemini' | null) ?? null,
    });
  }

  return (
    <div className="space-y-10">
      {/* Pending payments */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">{tp('title')}</h2>
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
        <h2 className="mb-4 text-lg font-semibold">{tu('title')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(users ?? []).map((u) => {
            const sub = latest.get(u.id);
            return (
              <UserRow
                key={u.id}
                userId={u.id}
                email={u.email}
                role={u.role}
                bannedUntil={u.banned_until}
                subEnd={sub?.end_at ?? null}
                plan={sub?.plan ?? null}
                network={sub?.network ?? null}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
