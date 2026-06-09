import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['ru', 'en', 'ar'],
  defaultLocale: 'ru',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
export const rtlLocales: Locale[] = ['ar'];

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
