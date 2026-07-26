import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  type MiddlewareRouteConfig,
  SESSION_COOKIE_NAMES,
  buildClearCookie,
  evaluateMiddleware,
  readSessionState,
} from '@chai/auth';

const OWNER_CONSOLE_CONFIG: MiddlewareRouteConfig = {
  audience: 'owner-console',
  defaultRedirect: '/',
  loginPath: '/login',
  protectedPrefixes: [
    '/audit',
    '/automation',
    '/logistics',
    '/marketplace',
    '/reliability',
    '/tenants',
    '/whitelabel',
  ],
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware for API routes, static files, and _next
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Auth enforcement — owner console is platform-owner-only.
  // The root page itself is treated as protected: an unauthenticated owner
  // console visit must land on /login, not on a half-rendered overview.
  const sessionState = readSessionState({
    get: (name) => request.cookies.get(name)?.value,
  });
  const decision = evaluateMiddleware(pathname, sessionState, OWNER_CONSOLE_CONFIG);
  if (decision.redirect) {
    const redirectUrl = new URL(decision.redirect, request.url);
    const response = NextResponse.redirect(redirectUrl);
    if (decision.clearSession) {
      response.headers.append(
        'Set-Cookie',
        buildClearCookie(SESSION_COOKIE_NAMES.accessToken),
      );
      response.headers.append(
        'Set-Cookie',
        buildClearCookie(SESSION_COOKIE_NAMES.refreshToken),
      );
      response.headers.append(
        'Set-Cookie',
        buildClearCookie(SESSION_COOKIE_NAMES.audience),
      );
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (handled separately)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
