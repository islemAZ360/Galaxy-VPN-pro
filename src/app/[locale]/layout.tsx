import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, rtlLocales, type Locale } from '@/i18n/routing';
import NextTopLoader from 'nextjs-toploader';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import '../globals.css';

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
      <body className="flex min-h-screen flex-col">
        <NextTopLoader color="#22d3ee" showSpinner={false} />
        <NextIntlClientProvider>
          <Navbar />
          <main className="mx-auto w-full flex-1 max-w-6xl px-4 pb-24">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
