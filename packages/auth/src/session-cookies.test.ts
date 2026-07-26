import { describe, expect, it } from 'vitest';

import {
  type Audience,
  type MiddlewareRouteConfig,
  SESSION_COOKIE_NAMES,
  buildClearCookie,
  buildSessionCookie,
  decodeTokenExp,
  evaluateMiddleware,
  readSessionState,
  shouldProtect,
} from './index';

const CLIENT_CONFIG: MiddlewareRouteConfig = {
  audience: 'client-portal',
  defaultRedirect: '/inbox',
  loginPath: '/login',
  protectedPrefixes: ['/inbox', '/analytics', '/payments', '/team', '/shipments'],
};

function makeCookieStore(cookies: Record<string, string>): {
  get(name: string): string | undefined;
} {
  return {
    get: (name) => cookies[name],
  };
}

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

describe('session cookies', () => {
  it('builds a Secure, HttpOnly, SameSite=Lax cookie', () => {
    const cookie = buildSessionCookie('chai_access_token', 'abc', 900);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=lax');
    expect(cookie).toContain('Max-Age=900');
    expect(cookie).toContain('Path=/');
  });

  it('respects explicit sameSite/secure overrides', () => {
    const cookie = buildSessionCookie('x', 'y', 60, {
      sameSite: 'strict',
      secure: false,
    });
    expect(cookie).toContain('SameSite=strict');
    expect(cookie).not.toContain('Secure');
  });

  it('builds a clear cookie with Max-Age=0', () => {
    expect(buildClearCookie('chai_access_token')).toContain('Max-Age=0');
    expect(buildClearCookie('chai_access_token')).toContain('HttpOnly');
  });

  it('decodes exp from a JWT payload', () => {
    expect(decodeTokenExp(makeToken(12345))).toBe(12345);
  });

  it('returns null for malformed token', () => {
    expect(decodeTokenExp('not-a-token')).toBeNull();
    expect(decodeTokenExp('a.b')).toBeNull();
  });
});

describe('readSessionState', () => {
  it('reports no session when cookies missing', () => {
    const state = readSessionState(makeCookieStore({}));
    expect(state.hasAccessToken).toBe(false);
    expect(state.hasRefreshToken).toBe(false);
    expect(state.audience).toBeNull();
    expect(state.expired).toBe(false);
  });

  it('detects unexpired access token', () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const state = readSessionState(
      makeCookieStore({
        [SESSION_COOKIE_NAMES.accessToken]: makeToken(future),
        [SESSION_COOKIE_NAMES.audience]: 'client-portal',
      }),
    );
    expect(state.hasAccessToken).toBe(true);
    expect(state.expired).toBe(false);
    expect(state.audience).toBe('client-portal');
  });

  it('marks expired access token', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const state = readSessionState(
      makeCookieStore({
        [SESSION_COOKIE_NAMES.accessToken]: makeToken(past),
      }),
    );
    expect(state.hasAccessToken).toBe(true);
    expect(state.expired).toBe(true);
  });
});

describe('shouldProtect', () => {
  it('matches exact and nested prefixes', () => {
    expect(shouldProtect('/inbox', CLIENT_CONFIG)).toBe(true);
    expect(shouldProtect('/inbox/conversation/123', CLIENT_CONFIG)).toBe(true);
    expect(shouldProtect('/payments', CLIENT_CONFIG)).toBe(true);
  });

  it('does not match unlisted paths', () => {
    expect(shouldProtect('/', CLIENT_CONFIG)).toBe(false);
    expect(shouldProtect('/login', CLIENT_CONFIG)).toBe(false);
    expect(shouldProtect('/about', CLIENT_CONFIG)).toBe(false);
  });
});

describe('evaluateMiddleware', () => {
  it('redirects unauthenticated users to login (no cookies to clear)', () => {
    const decision = evaluateMiddleware(
      '/inbox',
      {
        hasAccessToken: false,
        hasRefreshToken: false,
        audience: null,
        expired: false,
      },
      CLIENT_CONFIG,
    );
    expect(decision.redirect).toContain('/login');
    expect(decision.redirect).toContain('next=%2Finbox');
    expect(decision.clearSession).toBe(false);
  });

  it('clears stale session when access token expired', () => {
    const decision = evaluateMiddleware(
      '/analytics',
      {
        hasAccessToken: true,
        hasRefreshToken: true,
        audience: 'client-portal',
        expired: true,
      },
      CLIENT_CONFIG,
    );
    expect(decision.redirect).toContain('/login');
    expect(decision.clearSession).toBe(true);
  });

  it('lets valid sessions through', () => {
    const decision = evaluateMiddleware(
      '/inbox',
      {
        hasAccessToken: true,
        hasRefreshToken: true,
        audience: 'client-portal',
        expired: false,
      },
      CLIENT_CONFIG,
    );
    expect(decision.redirect).toBeUndefined();
  });

  it('redirects expired access token away from protected route', () => {
    const decision = evaluateMiddleware(
      '/inbox',
      {
        hasAccessToken: true,
        hasRefreshToken: false,
        audience: 'client-portal',
        expired: true,
      },
      CLIENT_CONFIG,
    );
    expect(decision.redirect).toContain('/login');
  });

  it('audience mismatch redirects to login', () => {
    const decision = evaluateMiddleware(
      '/inbox',
      {
        hasAccessToken: true,
        hasRefreshToken: true,
        audience: 'owner-console' as Audience,
        expired: false,
      },
      CLIENT_CONFIG,
    );
    expect(decision.redirect).toContain('/login');
    expect(decision.clearSession).toBe(true);
  });

  it('redirects already-authenticated users away from login', () => {
    const decision = evaluateMiddleware(
      '/login',
      {
        hasAccessToken: true,
        hasRefreshToken: true,
        audience: 'client-portal',
        expired: false,
      },
      CLIENT_CONFIG,
    );
    expect(decision.redirect).toBe('/inbox');
  });

  it('does not redirect on login page when unauthenticated', () => {
    const decision = evaluateMiddleware(
      '/login',
      {
        hasAccessToken: false,
        hasRefreshToken: false,
        audience: null,
        expired: false,
      },
      CLIENT_CONFIG,
    );
    expect(decision.redirect).toBeUndefined();
  });
});
