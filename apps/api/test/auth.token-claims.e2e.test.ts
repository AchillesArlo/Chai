import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issueTokens, verifyAccessToken, type Principal } from '@chai/auth';

import { loadTokenConfig } from '../src/auth/token-config';
import { createApplication } from '../src/bootstrap';

/**
 * R-02 regression: the resource server must read trust facts from signed token
 * claims and fail closed when a claim is absent. A token that never proved MFA,
 * never carried a platform role, or never recorded an authentication time must
 * not be promoted into one that did.
 *
 * These cases fail if `principalFromClaims` ever reverts to hardcoding
 * PLATFORM_OWNER / mfaState / ACTIVE / authenticatedAt=now.
 */

const TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789203';

const clientPrincipal: Principal = {
  audience: 'client-portal',
  authenticatedAt: new Date('2026-07-26T00:00:00.000Z'),
  id: '01890f47-9b3c-7cc2-98e8-1234567892f1',
  kind: 'USER',
  membership: {
    role: 'CLIENT_VIEWER',
    status: 'ACTIVE',
    tenantId: TENANT_ID,
  },
  status: 'ACTIVE',
};

const ownerPrincipal: Principal = {
  audience: 'owner-console',
  authenticatedAt: new Date('2026-07-26T00:00:00.000Z'),
  id: '01890f47-9b3c-7cc2-98e8-1234567892f2',
  kind: 'USER',
  mfaState: 'ENROLLED',
  platformRole: 'PLATFORM_OWNER',
  status: 'ACTIVE',
};

describe('token claim hydration fails closed', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
  });

  afterAll(async () => app.close());

  it('carries the trust facts on the issued access token', async () => {
    const issued = await issueTokens({
      config: loadTokenConfig(),
      principal: ownerPrincipal,
    });
    const verified = await verifyAccessToken(
      issued.accessToken,
      loadTokenConfig(),
    );

    expect(verified.ok).toBe(true);
    expect(verified.claims?.platformRole).toBe('PLATFORM_OWNER');
    expect(verified.claims?.mfaState).toBe('ENROLLED');
    expect(verified.claims?.principalStatus).toBe('ACTIVE');
    expect(verified.claims?.kind).toBe('USER');
    expect(verified.claims?.authTime).toBe(
      Math.floor(ownerPrincipal.authenticatedAt.getTime() / 1000),
    );
  });

  it('does not carry a platform role for a client principal', async () => {
    const issued = await issueTokens({
      config: loadTokenConfig(),
      principal: clientPrincipal,
    });
    const verified = await verifyAccessToken(
      issued.accessToken,
      loadTokenConfig(),
    );

    expect(verified.claims?.platformRole).toBeUndefined();
    expect(verified.claims?.membershipStatus).toBe('ACTIVE');
    expect(verified.claims?.role).toBe('CLIENT_VIEWER');
  });

  it('rejects a client-audience token on an owner route', async () => {
    const issued = await issueTokens({
      config: loadTokenConfig(),
      principal: clientPrincipal,
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${issued.accessToken}` },
      method: 'GET',
      url: '/api/owner/v1/tenants',
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toContain('PLATFORM_OWNER');
  });

  it('caps a service-audience token at the ADR-029 five minute lifetime', async () => {
    const issued = await issueTokens({
      config: loadTokenConfig(),
      principal: {
        audience: 'service',
        authenticatedAt: new Date('2026-07-26T00:00:00.000Z'),
        id: '01890f47-9b3c-7cc2-98e8-1234567892f3',
        kind: 'SERVICE',
        scopes: ['realtime:publish'],
        status: 'ACTIVE',
      },
    });

    expect(issued.expiresIn).toBe(300);

    const verified = await verifyAccessToken(
      issued.accessToken,
      loadTokenConfig(),
    );
    expect(verified.claims?.kind).toBe('SERVICE');
    expect(verified.claims?.scopes).toEqual(['realtime:publish']);
  });
});
