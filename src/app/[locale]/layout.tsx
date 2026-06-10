import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, rtlLocales, type Locale } from '@/i18n/routing';
import { Navbar } from '@/components/Navbar';
import '../globals.css';

import Galaxy from '@/components/Galaxy';

export const metadata: Metadata = {
  title: 'GalaxyVPN',
  description: 'Fast, private internet across the galaxy.',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const dir = rtlLocales.includes(locale as Locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body>
        <div className="fixed inset-0 -z-10 bg-[#0a0a1a]" style={{ width: '100%', height: '100vh', position: 'fixed' }}>
          <Galaxy
            mouseRepulsion={true}
            mouseInteraction={true}
            density={1.5}
            glowIntensity={0.5}
            saturation={0.8}
            hueShift={240}
          />
        </div>
        <NextIntlClientProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
