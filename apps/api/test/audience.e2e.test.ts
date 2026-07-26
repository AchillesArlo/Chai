import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

describe('API audience boundaries', () => {
  let app: NestFastifyApplication;
  const clientTenantId = '01890f47-9b3c-7cc2-98e8-123456789203';
  const otherTenantId = '01890f47-9b3c-7cc2-98e8-123456789204';

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('allows only the owner audience on owner routes', async () => {
    const owner = await app.inject({
      headers: { 'x-test-subject': 'local|owner' },
      method: 'GET',
      url: '/api/owner/v1/session',
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().data).toMatchObject({
      audience: 'owner-console',
      role: 'PLATFORM_OWNER',
    });
    expect(owner.json().data.permissions).toContain('platform.overview.read');

    const client = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/owner/v1/session',
    });
    expect(client.statusCode).toBe(403);
    expect(client.json().error.code).toBe('FORBIDDEN');
  });

  it.each([
    ['local|owner-disabled', 403, 'FORBIDDEN'],
    ['local|owner-roleless', 403, 'FORBIDDEN'],
    ['local|owner-service', 403, 'FORBIDDEN'],
    ['local|owner-mfa-required', 401, 'MFA_REQUIRED'],
  ] as const)(
    'rejects an ineligible owner principal %s',
    async (subject, statusCode, errorCode) => {
      const response = await app.inject({
        headers: { 'x-test-subject': subject },
        method: 'GET',
        url: '/api/owner/v1/session',
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json().error.code).toBe(errorCode);
    },
  );

  it('allows only tenant memberships on client routes', async () => {
    const client = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/session',
    });
    expect(client.statusCode).toBe(200);
    expect(client.json().data).toMatchObject({
      audience: 'client-portal',
      role: 'CLIENT_OWNER',
    });
    expect(client.json().data.permissions).toContain('tenant.profile.read');

    const owner = await app.inject({
      headers: { 'x-test-subject': 'local|owner' },
      method: 'GET',
      url: '/api/client/v1/session',
    });
    expect(owner.statusCode).toBe(403);
    expect(owner.json().error.code).toBe('FORBIDDEN');
  });

  it.each(['local|client-disabled', 'local|client-revoked'])(
    'rejects an inactive client principal %s',
    async (subject) => {
      const response = await app.inject({
        headers: { 'x-test-subject': subject },
        method: 'GET',
        url: '/api/client/v1/session',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    },
  );

  it('hides a tenant-scoped route when the selected tenant is not owned', async () => {
    const allowed = await app.inject({
      headers: {
        'x-tenant-id': clientTenantId,
        'x-test-subject': 'local|client-owner',
      },
      method: 'GET',
      url: '/api/client/v1/session',
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().data.tenantId).toBe(clientTenantId);

    const hidden = await app.inject({
      headers: {
        'x-tenant-id': otherTenantId,
        'x-test-subject': 'local|client-owner',
      },
      method: 'GET',
      url: '/api/client/v1/session',
    });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(hidden.json())).not.toContain(clientTenantId);
    expect(JSON.stringify(hidden.json())).not.toContain(otherTenantId);
  });

  it('accepts only a current owner tenant scope bound to the selected tenant', async () => {
    const unscoped = await app.inject({
      headers: { 'x-test-subject': 'local|owner' },
      method: 'GET',
      url: '/api/owner/v1/session',
    });
    expect(unscoped.statusCode).toBe(200);
    expect(unscoped.json().data.tenantId).toBeUndefined();

    const scoped = await app.inject({
      headers: {
        'x-tenant-id': clientTenantId,
        'x-test-subject': 'local|owner',
      },
      method: 'GET',
      url: '/api/owner/v1/session',
    });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json().data.tenantId).toBe(clientTenantId);

    const arbitrary = await app.inject({
      headers: {
        'x-tenant-id': otherTenantId,
        'x-test-subject': 'local|owner',
      },
      method: 'GET',
      url: '/api/owner/v1/session',
    });
    expect(arbitrary.statusCode).toBe(404);

    const expired = await app.inject({
      headers: {
        'x-tenant-id': clientTenantId,
        'x-test-subject': 'local|owner-expired-scope',
      },
      method: 'GET',
      url: '/api/owner/v1/session',
    });
    expect(expired.statusCode).toBe(404);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/client/v1/session',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('never accepts local identity headers in production mode', async () => {
    const production = await createApplication({ environment: 'production' });
    await production.init();
    await production.getHttpAdapter().getInstance().ready();

    try {
      const response = await production.inject({
        headers: { 'x-test-subject': 'local|owner' },
        method: 'GET',
        url: '/api/owner/v1/session',
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await production.close();
    }
  });
});
