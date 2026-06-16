'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { BarChart3, Server, Trash2, FolderGit2, Users, MessageCircle } from 'lucide-react';

const TABS = [
  { href: '/admin', key: 'tabStats', Icon: BarChart3 },
  { href: '/admin/servers', key: 'tabServers', Icon: Server },
  { href: '/admin/servers/deleted', key: 'tabServersDeleted', Icon: Trash2 },
  { href: '/admin/repos', key: 'tabRepos', Icon: FolderGit2 },
  { href: '/admin/users', key: 'tabUsers', Icon: Users },
  { href: '/admin/support', key: 'tabSupport', Icon: MessageCircle },
] as const;

export function AdminTabs() {
  const t = useTranslations('admin');
  const pathname = usePathname();

  return (
    <nav className="seg-nav">
      {TABS.map(({ href, key, Icon }) => {
        const active =
          href === '/admin'
            ? pathname === '/admin'
            : href === '/admin/servers'
              ? pathname === '/admin/servers'
              : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`seg-item pressable ${active ? 'seg-item--active' : ''}`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
