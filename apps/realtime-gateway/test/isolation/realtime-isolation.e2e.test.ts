import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRealtimeGateway } from '../../src/main';
import {
  bearer,
  clientPrincipal,
  publisherPrincipal,
  TOKEN_CONFIG,
} from '../helpers';

/**
 * Realtime subscription isolation — release blocker if a tenant stream
 * can observe another tenant's events, or if a caller can name the tenant
 * it wants to read (R-01).
 */
describe('e2e isolation — realtime SSE tenant boundary', () => {
  let app: FastifyInstance;
  let publisher: string;

  beforeAll(async () => {
    app = createRealtimeGateway({
      pollIntervalMs: 10,
      streamTimeoutMs: 60,
      tokenConfig: TOKEN_CONFIG,
    });
    await app.ready();
    publisher = await bearer(publisherPrincipal());
  });

  afterAll(async () => app.close());

  async function publish(tenantId: string, id: string, data: unknown): Promise<void> {
    const response = await app.inject({
      headers: { authorization: publisher },
      method: 'POST',
      payload: { data, event: 'message.appended', id },
      url: `/publish/${tenantId}`,
    });
    expect(response.statusCode).toBe(201);
  }

  it('never leaks published events across tenants', async () => {
    await publish('tenant-private', 'iso-rt-secret', {
      secret: 'tenant-private-payload',
    });

    const intruder = await app.inject({
      headers: {
        authorization: await bearer(clientPrincipal('tenant-observer')),
      },
      method: 'GET',
      url: '/stream',
    });

    expect(intruder.statusCode).toBe(200);
    expect(intruder.body).not.toContain('iso-rt-secret');
    expect(intruder.body).not.toContain('tenant-private-payload');
  });

  it('replays only within the tenant asserted by the token', async () => {
    await publish('tenant-a', 'iso-rt-a1', { n: 1 });
    await publish('tenant-b', 'iso-rt-b1', { n: 1 });

    const streamA = await app.inject({
      headers: {
        authorization: await bearer(clientPrincipal('tenant-a')),
        'last-event-id': 'iso-rt-a1',
      },
      method: 'GET',
      url: '/stream',
    });

    expect(streamA.body).not.toContain('iso-rt-b1');
  });

  it('refuses an unauthenticated subscription', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/stream' });

    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.body).toContain('MISSING_TOKEN');
  });

  it('refuses an unauthenticated publish', async () => {
    const anonymous = await app.inject({
      method: 'POST',
      payload: { data: {}, event: 'message.appended', id: 'anon-1' },
      url: '/publish/tenant-a',
    });

    expect(anonymous.statusCode).toBe(401);
  });

  it('refuses a user session as a publisher', async () => {
    const asUser = await app.inject({
      headers: { authorization: await bearer(clientPrincipal('tenant-a')) },
      method: 'POST',
      payload: { data: {}, event: 'message.appended', id: 'user-published-1' },
      url: '/publish/tenant-a',
    });

    expect(asUser.statusCode).toBe(403);
    expect(asUser.body).toContain('FORBIDDEN_AUDIENCE');
  });

  it('refuses a workload token without the publish scope', async () => {
    const unscoped = await app.inject({
      headers: { authorization: await bearer(publisherPrincipal([])) },
      method: 'POST',
      payload: { data: {}, event: 'message.appended', id: 'unscoped-1' },
      url: '/publish/tenant-a',
    });

    expect(unscoped.statusCode).toBe(403);
    expect(unscoped.body).toContain('MISSING_SCOPE');
  });

  it('cannot be steered to another tenant by a revoked membership', async () => {
    await publish('tenant-revoked', 'iso-rt-revoked', { n: 1 });

    const revoked = await app.inject({
      headers: {
        authorization: await bearer(
          clientPrincipal('tenant-revoked', {
            membership: {
              role: 'CLIENT_AGENT',
              status: 'REVOKED',
              tenantId: 'tenant-revoked',
            },
          }),
        ),
      },
      method: 'GET',
      url: '/stream',
    });

    expect(revoked.statusCode).toBe(403);
    expect(revoked.body).toContain('NO_TENANT_SCOPE');
  });
});
