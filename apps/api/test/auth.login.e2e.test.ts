import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { loadTokenConfig } from '../src/auth/token-config';
import { verifyAccessToken } from '@chai/auth';
import type { LoginResponse } from '@chai/contracts';

const OWNER_CREDENTIALS = {
  email: 'owner@chai.local',
  password: 'Password123!',
};

const CLIENT_CREDENTIALS = {
  email: 'client@chai.local',
  password: 'Password123!',
};

const AGENT_CREDENTIALS = {
  email: 'agent@chai.local',
  password: 'Password123!',
};

const DISABLED_CREDENTIALS = {
  email: 'disabled@chai.local',
  password: 'Password123!',
};

async function login(
  app: NestFastifyApplication,
  url: string,
  body: unknown,
): Promise<{ statusCode: number; body: unknown }> {
  const response = await app.inject({
    payload: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    url,
  });
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(response.body);
  } catch {
    parsedBody = response.body;
  }
  return { statusCode: response.statusCode, body: parsedBody };
}

async function authenticated(
  app: NestFastifyApplication,
  accessToken: string,
  url: string,
): Promise<{ statusCode: number; body: unknown }> {
  const response = await app.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: 'GET',
    url,
  });
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(response.body);
  } catch {
    parsedBody = response.body;
  }
  return { statusCode: response.statusCode, body: parsedBody };
}

describe('auth login endpoints', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login issues a verifiable owner access token', async () => {
    const result = await login(app, '/auth/login', OWNER_CREDENTIALS);
    expect(result.statusCode).toBe(200);
    const body = (result.body as { data: LoginResponse }).data;
    expect(body.tokenType).toBe('Bearer');
    expect(body.accessToken).toMatch(/\S+\.\S+\.\S+/);
    expect(body.principal.audience).toBe('owner-console');
    expect(body.principal.principalId).toBe(
      '01890f47-9b3c-7cc2-98e8-1234567892ff',
    );

    const verified = await verifyAccessToken(body.accessToken, loadTokenConfig());
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims?.aud).toBe('owner-console');
      expect(verified.claims?.role).toBeUndefined();
      expect(verified.claims?.tenantId).toBeUndefined();
    }
  });

  it('POST /api/client/v1/auth/login issues a tenant-scoped client token', async () => {
    const result = await login(app, '/api/client/v1/auth/login', CLIENT_CREDENTIALS);
    expect(result.statusCode).toBe(200);
    const body = (result.body as { data: LoginResponse }).data;
    expect(body.principal.audience).toBe('client-portal');
    expect(body.principal.tenantId).toBe(
      '01890f47-9b3c-7cc2-98e8-123456789203',
    );
    expect(body.principal.role).toBe('CLIENT_OWNER');

    const verified = await verifyAccessToken(body.accessToken, loadTokenConfig());
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims?.aud).toBe('client-portal');
      expect(verified.claims?.tenantId).toBe(
        '01890f47-9b3c-7cc2-98e8-123456789203',
      );
      expect(verified.claims?.role).toBe('CLIENT_OWNER');
    }
  });

  it('rejects wrong password with a single opaque message', async () => {
    const result = await login(app, '/auth/login', {
      email: OWNER_CREDENTIALS.email,
      password: 'WrongPassword!',
    });
    expect(result.statusCode).toBe(401);
    const errorBody = result.body as {
      error: { message: string; retryable: boolean };
    };
    expect(errorBody.error.message).toBe('Invalid email or password');
  });

  it('rejects unknown email with the same message as wrong password', async () => {
    const result = await login(app, '/auth/login', {
      email: 'does-not-exist@chai.local',
      password: 'Password123!',
    });
    expect(result.statusCode).toBe(401);
    const errorBody = result.body as { error: { message: string } };
    expect(errorBody.error.message).toBe('Invalid email or password');
  });

  it('rejects disabled account', async () => {
    const result = await login(
      app,
      '/api/client/v1/auth/login',
      DISABLED_CREDENTIALS,
    );
    expect(result.statusCode).toBe(401);
  });

  it('rejects owner credentials on client endpoint', async () => {
    const result = await login(app, '/api/client/v1/auth/login', OWNER_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('rejects client credentials on owner endpoint', async () => {
    const result = await login(app, '/auth/login', CLIENT_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('rejects malformed body with validation error', async () => {
    const result = await login(app, '/auth/login', { email: 'not-an-email' });
    expect(result.statusCode).toBe(400);
  });

  it('rejects password shorter than minimum length with validation error', async () => {
    const result = await login(app, '/auth/login', {
      email: OWNER_CREDENTIALS.email,
      password: 'short',
    });
    expect(result.statusCode).toBe(400);
  });
});

describe('auth token authentication on protected routes', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a real Bearer token and injects tenantContext', async () => {
    const loginResult = await login(
      app,
      '/api/client/v1/auth/login',
      CLIENT_CREDENTIALS,
    );
    const tokens = (loginResult.body as { data: LoginResponse }).data;

    // The client session endpoint requires an authenticated client principal.
    const sessionResponse = await authenticated(
      app,
      tokens.accessToken,
      '/api/client/v1/session',
    );
    expect(sessionResponse.statusCode).toBe(200);
    const sessionBody = (
      sessionResponse.body as {
        data: { audience: string; tenantId: string; role: string };
      }
    ).data;
    expect(sessionBody.audience).toBe('client-portal');
    expect(sessionBody.tenantId).toBe(tokens.principal.tenantId);
    expect(sessionBody.role).toBe('CLIENT_OWNER');
  });

  it('rejects an invalid Bearer token', async () => {
    const response = await authenticated(
      app,
      'aaa.bbb.ccc',
      '/api/client/v1/session',
    );
    expect(response.statusCode).toBe(401);
  });

  it('still honors x-test-subject fallback in test environment', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/session',
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('auth refresh and logout', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rotates a refresh token and revokes the old one', async () => {
    const loginResult = await login(app, '/auth/login', OWNER_CREDENTIALS);
    const tokens = (loginResult.body as { data: LoginResponse }).data;

    const refreshResult = await login(app, '/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });
    expect(refreshResult.statusCode).toBe(200);
    const refreshed = (refreshResult.body as { data: LoginResponse }).data;
    expect(refreshed.accessToken).not.toBe(tokens.accessToken);
    expect(refreshed.refreshToken).not.toBe(tokens.refreshToken);

    // Old refresh token is now revoked.
    const replay = await login(app, '/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });
    expect(replay.statusCode).toBe(409);
  });

  it('rejects access token used as refresh', async () => {
    const loginResult = await login(app, '/auth/login', OWNER_CREDENTIALS);
    const tokens = (loginResult.body as { data: LoginResponse }).data;

    const refresh = await login(app, '/auth/refresh', {
      refreshToken: tokens.accessToken,
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('rejects client refresh token on owner endpoint', async () => {
    const loginResult = await login(
      app,
      '/api/client/v1/auth/login',
      CLIENT_CREDENTIALS,
    );
    const tokens = (loginResult.body as { data: LoginResponse }).data;

    const refresh = await login(app, '/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('logout invalidates refresh tokens for the principal', async () => {
    const loginResult = await login(app, '/auth/login', OWNER_CREDENTIALS);
    const tokens = (loginResult.body as { data: LoginResponse }).data;

    const logoutResponse = await app.inject({
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      method: 'POST',
      url: '/auth/logout',
    });
    expect(logoutResponse.statusCode).toBe(204);

    const refresh = await login(app, '/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });
    expect(refresh.statusCode).toBe(409);
  });

  it('client refresh rotates and revokes', async () => {
    const loginResult = await login(
      app,
      '/api/client/v1/auth/login',
      AGENT_CREDENTIALS,
    );
    const tokens = (loginResult.body as { data: LoginResponse }).data;

    const refreshResult = await login(app, '/api/client/v1/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });
    expect(refreshResult.statusCode).toBe(200);
    const refreshed = (refreshResult.body as { data: LoginResponse }).data;
    expect(refreshed.principal.role).toBe('CLIENT_AGENT');
  });
});
