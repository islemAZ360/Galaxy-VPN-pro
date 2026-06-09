import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireAdmin } from '@/lib/admin';
import { ChatThread } from '@/components/ChatThread';

export default async function AdminSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ u?: string }>;
}) {
  const { locale } = await params;
  const { u: selected } = await searchParams;
  setRequestLocale(locale);
  const { admin } = await requireAdmin(locale);
  const t = await getTranslations('admin.support');

  const { data: rows } = await admin
    .from('support_messages')
    .select('user_id, body, created_at, users(email)')
    .order('created_at', { ascending: false });

  // latest message per conversation
  const convos = new Map<string, { email: string; snippet: string }>();
  for (const r of rows ?? []) {
    if (!convos.has(r.user_id)) {
      convos.set(r.user_id, {
        email: (r.users as unknown as { email: string } | null)?.email ?? '—',
        snippet: r.body ?? '🖼️',
      });
    }
  }
  const list = [...convos.entries()];
  const selectedEmail = selected ? convos.get(selected)?.email : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      {/* conversation list */}
      <div className="glass max-h-[75vh] overflow-y-auto p-2">
        <h2 className="px-2 py-2 text-sm font-semibold text-white/70">{t('title')}</h2>
        {list.length === 0 && <p className="p-4 text-center text-sm text-white/50">{t('none')}</p>}
        {list.map(([userId, c]) => (
          <Link
            key={userId}
            href={{ pathname: '/admin/support', query: { u: userId } }}
            className={`block rounded-lg px-3 py-2 ${selected === userId ? 'bg-galaxy-primary/30' : 'hover:bg-white/5'}`}
          >
            <div className="truncate text-sm font-medium">{c.email}</div>
            <div className="truncate text-xs text-white/50">{c.snippet}</div>
          </Link>
        ))}
      </div>

      {/* thread */}
      <div className="glass p-4">
        {selected ? (
          <>
            <div className="mb-3 border-b border-white/10 pb-2 text-sm font-medium">{selectedEmail}</div>
            <ChatThread threadUserId={selected} sender="admin" />
          </>
        ) : (
          <p className="grid h-[60vh] place-items-center text-sm text-white/50">{t('none')}</p>
        )}
      </div>
    </div>
  );
}
