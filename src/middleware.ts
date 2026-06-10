import createMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. locale routing
  const response = intlMiddleware(request);

  // Skip Supabase session refresh on prefetch requests to prevent network queue saturation
  if (request.headers.get('Next-Router-Prefetch')) {
    return response;
  }

  // 2. refresh the Supabase auth session and sync cookies onto the response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  
  // Use getSession() instead of getUser() to avoid a slow network round-trip 
  // to Supabase on every single page load. Server components still use getUser() for security.
  await supabase.auth.getSession();

  return response;
}

export const config = {
  // run on everything except api/auth routes, static files and assets.
  // `auth` is excluded so the OAuth callback (/auth/callback) is NOT given a
  // locale prefix by next-intl (which would 404 — the route lives at /auth/callback).
  matcher: ['/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
