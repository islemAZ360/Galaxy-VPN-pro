'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { BarChart3, Server, Trash2, FolderGit2, Users, MessageCircle, Ticket } from 'lucide-react';

const TABS = [
  { href: '/admin', key: 'tabStats', Icon: BarChart3 },
  { href: '/admin/servers', key: 'tabServers', Icon: Server },
  { href: '/admin/servers/deleted', key: 'tabServersDeleted', Icon: Trash2 },
  { href: '/admin/repos', key: 'tabRepos', Icon: FolderGit2 },
  { href: '/admin/users', key: 'tabUsers', Icon: Users },
  { href: '/admin/ggsel', key: 'tabGgsel', Icon: Ticket, label: 'GGSel' },
  { href: '/admin/support', key: 'tabSupport', Icon: MessageCircle },
] as const;

export function AdminTabs() {
  const t = useTranslations('admin');
  const pathname = usePathname();

  return (
    <nav className="seg-nav">
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin'
            ? pathname === '/admin'
            : tab.href === '/admin/servers'
              ? pathname === '/admin/servers'
              : pathname.startsWith(tab.href);
        const Icon = tab.Icon;
        const label = 'label' in tab ? tab.label : t(tab.key);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`seg-item pressable ${active ? 'seg-item--active' : ''}`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
