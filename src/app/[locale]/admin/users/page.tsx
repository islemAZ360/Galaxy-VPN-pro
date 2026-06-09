import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { PaymentReview } from '@/components/admin/PaymentReview';
import { UserRow } from '@/components/admin/UserRow';

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
    .select('id, amount_rub, plan, receipt_base64, user_id, users(email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const { data: users } = await admin
    .from('users')
    .select('id, email, role, banned_until, created_at')
    .order('created_at', { ascending: false });

  const { data: subs } = await admin
    .from('subscriptions')
    .select('user_id, end_at, created_at')
    .order('created_at', { ascending: false });

  const latestEnd = new Map<string, string | null>();
  for (const s of subs ?? []) {
    if (!latestEnd.has(s.user_id)) latestEnd.set(s.user_id, s.end_at);
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

      {/* Users */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">{tu('title')}</h2>
        <div className="glass overflow-x-auto p-5">
          <table className="w-full text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="py-2 text-start">{tu('email')}</th>
                <th className="py-2 text-start">{tu('role')}</th>
                <th className="py-2 text-start">{tu('subEnds')}</th>
                <th className="py-2 text-start">{tu('status')}</th>
                <th className="py-2 text-end"></th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <UserRow
                  key={u.id}
                  userId={u.id}
                  email={u.email}
                  role={u.role}
                  bannedUntil={u.banned_until}
                  subEnd={latestEnd.get(u.id) ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
