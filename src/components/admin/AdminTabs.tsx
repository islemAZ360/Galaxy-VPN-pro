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
    <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
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
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              active ? 'bg-galaxy-primary text-white' : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
