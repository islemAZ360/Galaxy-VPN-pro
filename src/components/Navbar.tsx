import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { LocaleSwitcher } from './LocaleSwitcher';
import { SignOutButton } from './SignOutButton';
import { MobileMenu } from './MobileMenu';

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
          {!isAdmin && <Link href="/#why">{t('features')}</Link>}
          {!isAdmin && <Link href="/#plans">{t('plans')}</Link>}
          {!isAdmin && <Link href="/#faq">{t('faq')}</Link>}
          {user && !isAdmin && <Link href="/profile">{t('profile')}</Link>}
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
            <div className="hidden md:block">
              <SignOutButton label={t('logout')} />
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden md:inline-flex rounded-lg bg-galaxy-primary px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              {t('login')}
            </Link>
          )}
          
          <MobileMenu 
            links={[
              { href: '/', label: t('home') },
              ...(!isAdmin ? [{ href: '/#why', label: t('features') }] : []),
              ...(!isAdmin ? [{ href: '/#plans', label: t('plans') }] : []),
              ...(!isAdmin ? [{ href: '/#faq', label: t('faq') }] : []),
              ...(user && !isAdmin ? [{ href: '/profile', label: t('profile') }] : []),
              ...(user ? [{ href: '/support', label: t('support') }] : []),
              ...(isAdmin ? [{ href: '/admin', label: t('admin'), accent: true }] : []),
              ...(user ? [] : [{ href: '/login', label: t('login'), accent: true }]),
            ]} 
            signOutNode={user ? <SignOutButton label={t('logout')} /> : undefined}
          />
        </div>
      </nav>
    </header>
  );
}
