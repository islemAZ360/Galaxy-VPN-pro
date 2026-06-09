import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { LocaleSwitcher } from './LocaleSwitcher';
import { SignOutButton } from './SignOutButton';

const ADMIN_EMAIL = 'islamazaizia360@gmail.com';

export async function Navbar() {
  const t = await getTranslations('nav');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-galaxy-bg/70 backdrop-blur">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="text-galaxy-accent">Galaxy</span>VPN
        </Link>
        <div className="hidden gap-5 text-sm text-white/80 md:flex">
          <Link href="/">{t('home')}</Link>
          <Link href="/#plans">{t('plans')}</Link>
          {user && <Link href="/profile">{t('profile')}</Link>}
          {user && <Link href="/support">{t('support')}</Link>}
          {isAdmin && (
            <Link href="/admin" className="text-galaxy-accent">
              {t('admin')}
            </Link>
          )}
        </div>
        <div className="ms-auto flex items-center gap-3">
          <LocaleSwitcher />
          {user ? (
            <SignOutButton label={t('logout')} />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-galaxy-primary px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              {t('login')}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
