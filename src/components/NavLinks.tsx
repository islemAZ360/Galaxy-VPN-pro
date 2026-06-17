'use client';

import { Link, usePathname } from '@/i18n/routing';

type NavItem = { href: string; label: string; accent?: boolean };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-1 text-sm md:flex">
      {items.map((it) => {
        // Anchor links (/#why) belong to the home page — no reliable active state.
        const isActive =
          !it.href.includes('#') &&
          (it.href === '/' ? pathname === '/' : pathname.startsWith(it.href));
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`relative rounded-lg px-3 py-1.5 transition-colors ${
              it.accent
                ? 'font-semibold text-galaxy-accent hover:text-cyan-300'
                : isActive
                  ? 'text-white'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            {it.label}
            {isActive && !it.accent && (
              <span className="absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-galaxy-accent to-violet-400" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
