import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyAccessToken } from '@chai/auth';
import type { LoginResponse } from '@chai/contracts';

import { loadTokenConfig } from '../src/auth/token-config';
import { createApplication } from '../src/bootstrap';

/**
 * B1 end-to-end coverage for the credential login path on the in-memory store
 * (no DATABASE_URL): success + token issuance, non-enumeration on failure,
 * temporary lockout, and the strict per-route login rate limit.
 *
 * Each concern gets its own application instance so the fresh InMemoryCredentialStore
 * (lockout counters) and the fresh per-instance rate-limit store never bleed
 * across describes.
 */

const OWNER = { email: 'owner@chai.local', password: 'Password123!' };
const CLIENT = { email: 'client@chai.local', password: 'Password123!' };

interface HttpResult {
  statusCode: number;
  json: unknown;
}

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function postJson(
  app: NestFastifyApplication,
  url: string,
  body: unknown,
  remoteAddress?: string,
): Promise<HttpResult> {
  const response = await app.inject({
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    payload: JSON.stringify(body),
    ...(remoteAddress ? { remoteAddress } : {}),
    url,
  });
  return { json: parseBody(response.body), statusCode: response.statusCode };
}

function errorEnvelope(result: HttpResult): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const error = (result.json as { error?: Record<string, unknown> }).error;
  return {
    code: String(error?.code),
    message: String(error?.message),
    retryable: Boolean(error?.retryable),
  };
}

async function makeApp(): Promise<NestFastifyApplication> {
  const app = await createApplication({ environment: 'test' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('B1 login success and non-enumeration (in-memory)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => app.close());

  it('issues a verifiable token for the correct owner password', async () => {
    const result = await postJson(app, '/auth/login', OWNER);
    expect(result.statusCode).toBe(200);
    const data = (result.json as { data: LoginResponse }).data;
    expect(data.tokenType).toBe('Bearer');
    expect(data.accessToken).toMatch(/\S+\.\S+\.\S+/);
    expect(data.refreshToken).toMatch(/\S+\.\S+\.\S+/);
    expect(data.principal.audience).toBe('owner-console');

    const verified = await verifyAccessToken(data.accessToken, loadTokenConfig());
    expect(verified.ok).toBe(true);
    expect(verified.claims?.aud).toBe('owner-console');
    expect(verified.claims?.platformRole).toBe('PLATFORM_OWNER');
  });

  it('issues a tenant-scoped token for the correct client password', async () => {
    const result = await postJson(app, '/api/client/v1/auth/login', CLIENT);
    expect(result.statusCode).toBe(200);
    const data = (result.json as { data: LoginResponse }).data;
    expect(data.principal.audience).toBe('client-portal');
    expect(data.principal.role).toBe('CLIENT_OWNER');
    expect(data.principal.tenantId).toBeTruthy();

    const verified = await verifyAccessToken(data.accessToken, loadTokenConfig());
    expect(verified.claims?.tenantId).toBe(data.principal.tenantId);
  });

  it('returns an identical failure for an unknown email and a wrong password', async () => {
    // A known email with the wrong password must be indistinguishable from an
    // email that does not exist at all — same status, code, message, retryable.
    const wrongPassword = await postJson(app, '/auth/login', {
      email: OWNER.email,
      password: 'DefinitelyWrong123!',
    });
    const unknownEmail = await postJson(app, '/auth/login', {
      email: 'ghost-user@chai.local',
      password: 'DefinitelyWrong123!',
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(errorEnvelope(wrongPassword)).toEqual(errorEnvelope(unknownEmail));
    // And the message leaks nothing about which factor failed.
    expect(errorEnvelope(wrongPassword).message).toBe('Invalid email or password');
    expect(JSON.stringify(unknownEmail.json)).not.toMatch(/not found|unknown|exist|locked|disabled/i);
  });
});

describe('B1 temporary lockout after repeated failures (in-memory)', () => {
  let app: NestFastifyApplication;

  // A dedicated address keeps the strict login bucket for this describe isolated.
  const address = '10.10.0.2';

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => app.close());

  it('locks the account after 5 failures and then rejects the correct password', async () => {
    // Five consecutive wrong passwords reach the lockout threshold (5).
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failed = await postJson(
        app,
        '/api/client/v1/auth/login',
        { email: CLIENT.email, password: 'DefinitelyWrong123!' },
        address,
      );
      expect(failed.statusCode).toBe(401);
      expect(errorEnvelope(failed).message).toBe('Invalid email or password');
    }

    // The correct password is now refused because the account is locked — proof
    // the lock, not the password check, is what rejects this request. (The very
    // same credentials succeed on a fresh instance in the success suite above.)
    const lockedOut = await postJson(
      app,
      '/api/client/v1/auth/login',
      CLIENT,
      address,
    );
    expect(lockedOut.statusCode).toBe(401);
    expect(errorEnvelope(lockedOut).message).toBe('Invalid email or password');
  });
});

describe('B1 login rate limit (in-memory)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => app.close());

  it('returns 429 once the strict login threshold is exceeded', async () => {
    // Unknown email so this never trips lockout; the strict login limiter keys on
    // ip+email, so a single bucket accumulates every attempt.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await postJson(
        app,
        '/auth/login',
        { email: 'flood-probe@chai.local', password: 'DefinitelyWrong123!' },
        '10.20.0.3',
      );
      statuses.push(result.statusCode);
    }

    const firstBlocked = statuses.indexOf(429);
    expect(firstBlocked).toBeGreaterThan(0);
    // Everything before the first 429 was actually processed (401), not blocked.
    expect(statuses.slice(0, firstBlocked).every((code) => code === 401)).toBe(true);

    const blocked = await postJson(
      app,
      '/auth/login',
      { email: 'flood-probe@chai.local', password: 'DefinitelyWrong123!' },
      '10.20.0.3',
    );
    expect(blocked.statusCode).toBe(429);
    expect(errorEnvelope(blocked).code).toBe('RATE_LIMITED');
    expect(errorEnvelope(blocked).retryable).toBe(true);
  });

  it('does not apply the strict login threshold to other routes', async () => {
    // Far more than the strict login cap, on a non-login route: none are blocked,
    // proving the tight limit is scoped to the login surface only.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.inject({
        method: 'GET',
        remoteAddress: '10.20.0.4',
        url: '/api/v1/health',
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.every((code) => code === 200)).toBe(true);
  });
});
