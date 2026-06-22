import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireAdmin } from '@/lib/admin';
import { ChatThread } from '@/components/ChatThread';
import { MessageCircle } from 'lucide-react';

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
    .order('created_at', { ascending: false })
    .limit(1000);

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
    <div className="grid gap-5 md:grid-cols-[300px_1fr]">
      {/* conversation list */}
      <div className="admin-panel max-h-[75vh] overflow-y-auto p-2.5">
        <div className="flex items-center gap-2 px-2 py-2">
          <MessageCircle className="h-4 w-4 text-galaxy-accent" strokeWidth={2.2} />
          <h2 className="text-sm font-semibold text-white/80">{t('title')}</h2>
          {list.length > 0 && (
            <span className="ms-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs tabular-nums text-white/55">
              {list.length}
            </span>
          )}
        </div>
        {list.length === 0 && <p className="p-6 text-center text-sm text-white/45">{t('none')}</p>}
        <div className="mt-1 space-y-1">
          {list.map(([userId, c]) => {
            const active = selected === userId;
            return (
              <Link
                key={userId}
                href={{ pathname: '/admin/support', query: { u: userId } }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  active
                    ? 'border border-galaxy-primary/40 bg-galaxy-primary/20'
                    : 'border border-transparent hover:bg-white/5'
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${active ? 'bg-galaxy-primary/40 text-white' : 'bg-white/10 text-white/70'}`}>
                  {(c.email[0] || '?').toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.email}</span>
                  <span className="block truncate text-xs text-white/45">{c.snippet}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* thread */}
      <div className="admin-panel p-4 sm:p-5">
        {selected ? (
          <>
            <div className="mb-3 flex items-center gap-2.5 border-b border-white/10 pb-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-galaxy-primary/30 text-sm font-bold text-white">
                {(selectedEmail?.[0] || '?').toUpperCase()}
              </span>
              <span className="text-sm font-medium">{selectedEmail}</span>
            </div>
            <ChatThread threadUserId={selected} sender="admin" />
          </>
        ) : (
          <div className="grid h-[60vh] place-items-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <MessageCircle className="h-8 w-8 text-white/20" />
              <p className="text-sm text-white/45">{t('none')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
