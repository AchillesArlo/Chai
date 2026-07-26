import type { Audience } from './audiences';

/**
 * Browser/Edge-safe session helpers. Token verification happens at the API
 * layer — the middleware only checks presence + expiry to decide redirects.
 *
 * ponytail: no crypto import here (Edge runtime boundary), no Buffer (browser).
 */

export const SESSION_COOKIE_NAMES = {
  accessToken: 'chai_access_token',
  refreshToken: 'chai_refresh_token',
  audience: 'chai_session_audience',
} as const;

export interface SessionCookieOptions {
  audience: Audience;
  accessToken: string;
  refreshToken: string;
  /**
   * Access-token TTL in seconds (drives max-age; refresh lives longer but the
   * cookie is rewritten on each refresh).
   */
  maxAgeSeconds: number;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  domain?: string;
}

export function buildSessionCookie(name: string, value: string, maxAgeSeconds: number, options?: Pick<SessionCookieOptions, 'secure' | 'sameSite' | 'path' | 'domain'>): string {
  const segments = [
    `${name}=${value}`,
    `Path=${options?.path ?? '/'}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
  ];
  const sameSite = options?.sameSite ?? 'lax';
  segments.push(`SameSite=${sameSite}`);
  if (options?.secure ?? true) {
    segments.push('Secure');
  }
  if (options?.domain) {
    segments.push(`Domain=${options.domain}`);
  }
  return segments.join('; ');
}

export function buildClearCookie(name: string, path = '/'): string {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=lax`;
}

export interface SessionState {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  audience: Audience | null;
  expired: boolean;
}

/**
 * Decode a JWT payload WITHOUT verifying the signature — the API verifies
 * on every request. We only read exp here to drive redirect logic.
 * Returns null on malformed token.
 */
export function decodeTokenExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;
  try {
    const payload = JSON.parse(
      typeof atob === 'function'
        ? atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(payloadSegment, 'base64').toString('utf8'),
    ) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp;
  } catch {
    return null;
  }
}

export function readSessionState(cookies: {
  get(name: string): string | undefined;
}): SessionState {
  const accessToken = cookies.get(SESSION_COOKIE_NAMES.accessToken);
  const refreshToken = cookies.get(SESSION_COOKIE_NAMES.refreshToken);
  const audience = cookies.get(SESSION_COOKIE_NAMES.audience) as Audience | null;
  const exp = accessToken ? decodeTokenExp(accessToken) : null;
  const now = Math.floor(Date.now() / 1000);
  return {
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    audience: audience ?? null,
    expired: exp !== null && exp < now,
  };
}

export interface MiddlewareRouteConfig {
  /** Paths that require authentication (audience match). */
  protectedPrefixes: readonly string[];
  /** Path to redirect to when unauthenticated. */
  loginPath: string;
  /** Path to redirect to after successful login. */
  defaultRedirect: string;
  /** Audience this portal belongs to. */
  audience: Audience;
}

export function shouldProtect(pathname: string, config: MiddlewareRouteConfig): boolean {
  return config.protectedPrefixes.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix) || pathname === prefix.slice(0, -1)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export interface MiddlewareDecision {
  redirect?: string;
  clearSession?: boolean;
}

export function evaluateMiddleware(
  pathname: string,
  state: SessionState,
  config: MiddlewareRouteConfig,
): MiddlewareDecision {
  const isLoginPath = pathname === config.loginPath;
  const isProtected = shouldProtect(pathname, config);

  if (isProtected) {
    if (!state.hasAccessToken || state.expired) {
      if (state.hasRefreshToken && !state.expired) {
        // Token refresh is handled client-side; let the page try silent refresh.
        return {};
      }
      // Only clear cookies when there's actually something stale to clear.
      const hasStaleTokens = state.hasAccessToken || state.hasRefreshToken;
      return {
        redirect: `${config.loginPath}?next=${encodeURIComponent(pathname)}`,
        clearSession: hasStaleTokens,
      };
    }
    if (state.audience && state.audience !== config.audience) {
      // Audience mismatch — wrong portal. Redirect to login.
      return {
        redirect: `${config.loginPath}?next=${encodeURIComponent(pathname)}`,
        clearSession: true,
      };
    }
    return {};
  }

  if (isLoginPath && state.hasAccessToken && !state.expired) {
    return { redirect: config.defaultRedirect };
  }

  return {};
}
