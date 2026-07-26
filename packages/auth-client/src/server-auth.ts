import {
  type Audience,
  SESSION_COOKIE_NAMES,
  type TokenConfig,
  decodeTokenUnsafe,
  verifyAccessToken,
} from '@chai/auth';
import type { LoginResponse } from '@chai/contracts';

/**
 * Server-side auth client. Cookies are HttpOnly so all reads/writes happen
 * through Next's cookies() API. The browser never sees the raw token.
 *
 * Import only from Server Components / Server Actions / Route Handlers — this
 * module uses fetch and reads cookies that are not available in the browser.
 */

interface NextCookiesAdapter {
  get(name: string): { value?: string } | undefined;
  set(name: string, value: string, options: Record<string, unknown>): void;
  delete(name: string): void;
}

export type { NextCookiesAdapter };

export interface AuthServerConfig {
  /** Base URL of the API service, e.g. http://localhost:3000. */
  apiBaseUrl: string;
  /** Audience this portal authenticates against. */
  audience: Audience;
  /** Whether Secure should be set on session cookies. Defaults to true. */
  secure?: boolean;
  /** Cookie domain. Omit for host-only cookies. */
  domain?: string;
  /** Optional token config used to verify the access token locally. */
  tokenConfig?: TokenConfig;
}

function ensureResponse<T>(response: Response, fallback: T): T | null {
  if (!response.ok) return null;
  return response.json() as Promise<T> as unknown as T ?? fallback;
}

export interface SessionState {
  principalId: string | null;
  audience: Audience | null;
  tenantId: string | null;
  role: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
}

export function readSessionStateFromCookies(
  cookies: NextCookiesAdapter,
): SessionState {
  const accessToken = cookies.get(SESSION_COOKIE_NAMES.accessToken)?.value;
  const audience = cookies.get(SESSION_COOKIE_NAMES.audience)?.value as
    | Audience
    | undefined;
  if (!accessToken) {
    return {
      principalId: null,
      audience: audience ?? null,
      tenantId: null,
      role: null,
      expiresAt: null,
      isAuthenticated: false,
    };
  }
  const claims = decodeTokenUnsafe(accessToken);
  if (!claims) {
    return {
      principalId: null,
      audience: audience ?? null,
      tenantId: null,
      role: null,
      expiresAt: null,
      isAuthenticated: false,
    };
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    principalId: claims.sub,
    audience: claims.aud,
    tenantId: claims.tenantId ?? null,
    role: claims.role ?? null,
    expiresAt: claims.exp,
    isAuthenticated: claims.exp > now,
  };
}

export async function loginOnServer(
  config: AuthServerConfig,
  cookies: NextCookiesAdapter,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(`${config.apiBaseUrl}${loginPath(config.audience)}`, {
    body: JSON.stringify({ email, password }),
    headers: {
      'content-type': 'application/json',
      'x-internal-call': 'true',
    },
    method: 'POST',
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as {
      error?: { message?: string };
    };
    throw new AuthError(
      errorBody.error?.message ?? 'Login failed',
      response.status,
    );
  }
  const envelope = (await response.json()) as { data: LoginResponse };
  const session = envelope.data;
  writeSessionCookies(config, cookies, session);
  return session;
}

export async function refreshOnServer(
  config: AuthServerConfig,
  cookies: NextCookiesAdapter,
): Promise<LoginResponse | null> {
  const refreshToken = cookies.get(SESSION_COOKIE_NAMES.refreshToken)?.value;
  if (!refreshToken) return null;
  const response = await fetch(`${config.apiBaseUrl}${refreshPath(config.audience)}`, {
    body: JSON.stringify({ refreshToken }),
    headers: {
      'content-type': 'application/json',
      'x-internal-call': 'true',
    },
    method: 'POST',
  });
  if (!response.ok) {
    clearSessionCookies(config, cookies);
    return null;
  }
  const envelope = (await response.json()) as { data: LoginResponse };
  const session = envelope.data;
  writeSessionCookies(config, cookies, session);
  return session;
}

export async function logoutOnServer(
  config: AuthServerConfig,
  cookies: NextCookiesAdapter,
): Promise<void> {
  const accessToken = cookies.get(SESSION_COOKIE_NAMES.accessToken)?.value;
  if (accessToken) {
    // Best-effort: never block logout on the API call.
    try {
      await fetch(`${config.apiBaseUrl}${logoutPath(config.audience)}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'POST',
      });
    } catch {
      // Ignore — we clear cookies regardless.
    }
  }
  clearSessionCookies(config, cookies);
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function loginPath(audience: Audience): string {
  return audience === 'owner-console' ? '/auth/login' : '/api/client/v1/auth/login';
}

function refreshPath(audience: Audience): string {
  return audience === 'owner-console' ? '/auth/refresh' : '/api/client/v1/auth/refresh';
}

function logoutPath(audience: Audience): string {
  return audience === 'owner-console' ? '/auth/logout' : '/api/client/v1/auth/logout';
}

function writeSessionCookies(
  config: AuthServerConfig,
  cookies: NextCookiesAdapter,
  session: LoginResponse,
): void {
  const baseOptions: Record<string, unknown> = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.secure ?? true,
    path: '/',
    maxAge: session.expiresIn,
  };
  if (config.domain) {
    baseOptions.domain = config.domain;
  }
  cookies.set(SESSION_COOKIE_NAMES.accessToken, session.accessToken, baseOptions);
  // Refresh token lives longer — derive from the token's own exp.
  const refreshExp = decodeTokenUnsafe(session.refreshToken)?.exp;
  const refreshMaxAge =
    typeof refreshExp === 'number'
      ? Math.max(refreshExp - Math.floor(Date.now() / 1000), session.expiresIn)
      : session.expiresIn * 4;
  cookies.set(
    SESSION_COOKIE_NAMES.refreshToken,
    session.refreshToken,
    { ...baseOptions, maxAge: refreshMaxAge },
  );
  cookies.set(SESSION_COOKIE_NAMES.audience, session.principal.audience, {
    ...baseOptions,
    maxAge: refreshMaxAge,
  });
}

function clearSessionCookies(
  _config: AuthServerConfig,
  cookies: NextCookiesAdapter,
): void {
  cookies.delete(SESSION_COOKIE_NAMES.accessToken);
  cookies.delete(SESSION_COOKIE_NAMES.refreshToken);
  cookies.delete(SESSION_COOKIE_NAMES.audience);
}

export async function verifySession(
  config: AuthServerConfig,
  cookies: NextCookiesAdapter,
): Promise<boolean> {
  if (!config.tokenConfig) {
    return readSessionStateFromCookies(cookies).isAuthenticated;
  }
  const accessToken = cookies.get(SESSION_COOKIE_NAMES.accessToken)?.value;
  if (!accessToken) return false;
  const result = await verifyAccessToken(accessToken, config.tokenConfig);
  return result.ok;
}

export { ensureResponse };
