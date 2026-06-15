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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-galaxy-bg/70 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight transition-opacity hover:opacity-80">
          <img src="/icon-192x192.png" alt="GalaxyVPN Icon" className="h-7 w-7 rounded-md" />
          <span><span className="bg-gradient-to-r from-galaxy-accent to-violet-400 bg-clip-text text-transparent">Galaxy</span>VPN</span>
        </Link>
        <div className="hidden gap-1 text-sm text-white/75 md:flex [&>a]:rounded-lg [&>a]:px-3 [&>a]:py-1.5 [&>a]:transition-colors [&>a:hover]:bg-white/5 [&>a:hover]:text-white">
          <Link href="/">{t('home')}</Link>
          {!isAdmin && <Link href="/#why">{t('features')}</Link>}
          {!isAdmin && <Link href="/#plans">{t('plans')}</Link>}
          {!isAdmin && <Link href="/servers">{t('servers')}</Link>}
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
              className="hidden md:inline-flex rounded-lg bg-gradient-to-br from-galaxy-primary to-indigo-600 px-4 py-2 text-sm font-semibold shadow-[0_2px_12px_rgba(124,58,237,0.4)] transition-all hover:shadow-[0_4px_18px_rgba(124,58,237,0.6)] hover:-translate-y-px"
            >
              {t('login')}
            </Link>
          )}
          
          <MobileMenu 
            links={[
              { href: '/', label: t('home') },
              ...(!isAdmin ? [{ href: '/#why', label: t('features') }] : []),
              ...(!isAdmin ? [{ href: '/#plans', label: t('plans') }] : []),
              ...(!isAdmin ? [{ href: '/servers', label: t('servers') }] : []),
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
