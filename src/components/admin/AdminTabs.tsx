'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

const TABS = [
  { href: '/admin', key: 'tabStats' },
  { href: '/admin/servers', key: 'tabServers' },
  { href: '/admin/servers/deleted', key: 'tabServersDeleted' },
  { href: '/admin/repos', key: 'tabRepos' },
  { href: '/admin/users', key: 'tabUsers' },
  { href: '/admin/support', key: 'tabSupport' },
] as const;

export function AdminTabs() {
  const t = useTranslations('admin');
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur">
      {TABS.map((tab) => {
        const active = tab.href === '/admin'
          ? pathname === '/admin'
          : tab.href === '/admin/servers'
            ? pathname === '/admin/servers'
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              active
                ? 'bg-gradient-to-br from-galaxy-primary to-indigo-600 text-white shadow-[0_2px_12px_rgba(124,58,237,0.4)]'
                : 'text-white/65 hover:bg-white/5 hover:text-white'
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
