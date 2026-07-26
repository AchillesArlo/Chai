import { describe, expect, it, vi } from 'vitest';

import {
  type AuthServerConfig,
  type NextCookiesAdapter,
  readSessionStateFromCookies,
  loginOnServer,
  refreshOnServer,
  logoutOnServer,
} from './server-auth';

import { SESSION_COOKIE_NAMES } from '@chai/auth';

function makeCookies(initial: Record<string, string> = {}): NextCookiesAdapter {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: (name) => {
      const value = store.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name, value) => {
      store.set(name, value);
    },
    delete: (name) => {
      store.delete(name);
    },
  };
}

function makeToken(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.sig`;
}

const CONFIG: AuthServerConfig = {
  apiBaseUrl: 'http://api.test',
  audience: 'client-portal',
};

const OWNER_CONFIG: AuthServerConfig = {
  apiBaseUrl: 'http://api.test',
  audience: 'owner-console',
};

describe('readSessionStateFromCookies', () => {
  it('returns unauthenticated when no access cookie', () => {
    const state = readSessionStateFromCookies(makeCookies({}));
    expect(state.isAuthenticated).toBe(false);
    expect(state.principalId).toBeNull();
  });

  it('reads principal from a valid token', () => {
    const token = makeToken({
      sub: 'user-1',
      aud: 'client-portal',
      tenantId: 'tenant-1',
      role: 'CLIENT_OWNER',
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const state = readSessionStateFromCookies(
      makeCookies({ [SESSION_COOKIE_NAMES.accessToken]: token }),
    );
    expect(state.isAuthenticated).toBe(true);
    expect(state.principalId).toBe('user-1');
    expect(state.tenantId).toBe('tenant-1');
    expect(state.role).toBe('CLIENT_OWNER');
    expect(state.audience).toBe('client-portal');
  });

  it('marks expired token as unauthenticated', () => {
    const token = makeToken({
      sub: 'user-1',
      aud: 'client-portal',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const state = readSessionStateFromCookies(
      makeCookies({ [SESSION_COOKIE_NAMES.accessToken]: token }),
    );
    expect(state.isAuthenticated).toBe(false);
  });
});

describe('loginOnServer', () => {
  it('sets session cookies on a successful login', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              accessToken: makeToken({ sub: 'user-1', aud: 'client-portal', exp: 9999999999 }),
              refreshToken: makeToken({ sub: 'user-1', aud: 'client-portal', exp: 9999999999, tokenType: 'refresh' }),
              expiresIn: 900,
              tokenType: 'Bearer',
              principal: { principalId: 'user-1', audience: 'client-portal', tenantId: 't-1', role: 'CLIENT_OWNER' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const cookies = makeCookies();
    await loginOnServer(CONFIG, cookies, 'x@y.local', 'Password123!');
    expect(cookies.get(SESSION_COOKIE_NAMES.accessToken)?.value).toBeDefined();
    expect(cookies.get(SESSION_COOKIE_NAMES.refreshToken)?.value).toBeDefined();
    expect(cookies.get(SESSION_COOKIE_NAMES.audience)?.value).toBe('client-portal');
    fetchMock.mockRestore();
  });

  it('throws AuthError with API message on failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'Invalid email or password' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );
    await expect(
      loginOnServer(CONFIG, makeCookies(), 'x@y.local', 'wrong'),
    ).rejects.toMatchObject({ message: 'Invalid email or password', statusCode: 401 });
    fetchMock.mockRestore();
  });

  it('hits the owner path when audience is owner-console', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              accessToken: makeToken({ sub: 'owner-1', aud: 'owner-console', exp: 9999999999 }),
              refreshToken: makeToken({ sub: 'owner-1', aud: 'owner-console', exp: 9999999999, tokenType: 'refresh' }),
              expiresIn: 600,
              tokenType: 'Bearer',
              principal: { principalId: 'owner-1', audience: 'owner-console' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    await loginOnServer(OWNER_CONFIG, makeCookies(), 'owner@chai.local', 'Password123!');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/auth/login');
    fetchMock.mockRestore();
  });
});

describe('refreshOnServer', () => {
  it('returns null when no refresh cookie', async () => {
    const result = await refreshOnServer(CONFIG, makeCookies({}));
    expect(result).toBeNull();
  });

  it('clears cookies when refresh fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"error":{}}', { status: 401 }));
    const cookies = makeCookies({
      [SESSION_COOKIE_NAMES.accessToken]: 'stale',
      [SESSION_COOKIE_NAMES.refreshToken]: 'stale-refresh',
      [SESSION_COOKIE_NAMES.audience]: 'client-portal',
    });
    await refreshOnServer(CONFIG, cookies);
    expect(cookies.get(SESSION_COOKIE_NAMES.accessToken)).toBeUndefined();
    expect(cookies.get(SESSION_COOKIE_NAMES.refreshToken)).toBeUndefined();
    fetchMock.mockRestore();
  });
});

describe('logoutOnServer', () => {
  it('clears cookies even when API call fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network down'));
    const cookies = makeCookies({
      [SESSION_COOKIE_NAMES.accessToken]: makeToken({ sub: 'u', aud: 'client-portal', exp: 9999999999 }),
      [SESSION_COOKIE_NAMES.refreshToken]: 'refresh',
      [SESSION_COOKIE_NAMES.audience]: 'client-portal',
    });
    await logoutOnServer(CONFIG, cookies);
    expect(cookies.get(SESSION_COOKIE_NAMES.accessToken)).toBeUndefined();
    expect(cookies.get(SESSION_COOKIE_NAMES.refreshToken)).toBeUndefined();
    fetchMock.mockRestore();
  });

  it('does not call API when no access cookie', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await logoutOnServer(CONFIG, makeCookies({}));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
