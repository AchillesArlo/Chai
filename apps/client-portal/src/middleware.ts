import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  type MiddlewareRouteConfig,
  SESSION_COOKIE_NAMES,
  buildClearCookie,
  evaluateMiddleware,
  readSessionState,
} from '@chai/auth';

const CLIENT_PORTAL_CONFIG: MiddlewareRouteConfig = {
  audience: 'client-portal',
  defaultRedirect: '/portal/inbox',
  loginPath: '/login',
  protectedPrefixes: [
    '/inbox',
    '/analytics',
    '/payments',
    '/shipments',
    '/team',
  ],
};

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
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

  // Auth enforcement — runs for every page, including custom-domain tenants.
  // The login page itself and `/` are public; protected prefixes require a
  // valid, non-expired access token cookie. The API verifies the signature;
  // the middleware only gates on presence/expiry/audience.
  const sessionState = readSessionState({
    get: (name) => request.cookies.get(name)?.value,
  });
  const decision = evaluateMiddleware(pathname, sessionState, CLIENT_PORTAL_CONFIG);
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

  // Check if this is a custom domain (not the default portal domain)
  const isCustomDomain =
    !hostname.includes('localhost') && !hostname.includes('chai.app');

  if (isCustomDomain) {
    // Fetch theme and domain info from API
    try {
      const domainRes = await fetch(
        `${process.env.API_URL || 'http://localhost:3000'}/api/v1/whitelabel/domains/lookup?domain=${hostname}`,
        { next: { revalidate: 60 } }, // Cache for 60 seconds
      );

      if (!domainRes.ok) {
        return NextResponse.next();
      }

      const domain = await domainRes.json();

      if (domain.status !== 'ACTIVE' && domain.status !== 'VERIFIED') {
        return new NextResponse('Domain not verified', { status: 403 });
      }

      // Fetch theme settings
      const themeRes = await fetch(
        `${process.env.API_URL || 'http://localhost:3000'}/api/v1/whitelabel/themes?tenantId=${domain.tenantId}`,
        { next: { revalidate: 60 } },
      );

      if (themeRes.ok) {
        const theme = await themeRes.json();

        // Rewrite to custom domain route with theme context
        const response = NextResponse.rewrite(
          new URL(`/custom-portal${pathname}`, request.url),
        );

        // Inject theme into headers for client-side access
        response.headers.set('x-theme-brand', theme.brandName || '');
        response.headers.set('x-theme-primary', theme.primaryColor || '#3B82F6');
        response.headers.set('x-theme-secondary', theme.secondaryColor || '#10B981');
        response.headers.set('x-theme-accent', theme.accentColor || '#F59E0B');
        response.headers.set('x-theme-logo', theme.logoUrl || '');
        response.headers.set('x-tenant-id', domain.tenantId);

        return response;
      }
    } catch (error) {
      console.error('Custom domain middleware error:', error);
      // Fall through to default portal
    }
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
