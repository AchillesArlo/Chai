import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRealtimeGateway } from '../src/main';
import {
  bearer,
  clientPrincipal,
  ownerPrincipal,
  publisherPrincipal,
  TOKEN_CONFIG,
} from './helpers';

describe('realtime gateway SSE', () => {
  let app: FastifyInstance;
  let publisher: string;

  beforeAll(async () => {
    app = createRealtimeGateway({
      // Keep the socket short-lived so inject() resolves; production keeps the
      // stream open and relies on heartbeats.
      pollIntervalMs: 10,
      streamTimeoutMs: 250,
      tokenConfig: TOKEN_CONFIG,
    });
    await app.ready();
    publisher = await bearer(publisherPrincipal());
  });

  afterAll(async () => app.close());

  async function publish(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const response = await app.inject({
      headers: { authorization: publisher },
      method: 'POST',
      payload: { data, event: 'message.appended', id },
      url: `/publish/${tenantId}`,
    });
    expect(response.statusCode).toBe(201);
  }

  it('replays missed events after a Last-Event-ID cursor', async () => {
    await publish('tenant-a', 'evt-1', { n: 1 });
    await publish('tenant-a', 'evt-2', { n: 2 });

    const stream = await app.inject({
      headers: {
        authorization: await bearer(clientPrincipal('tenant-a')),
        'last-event-id': 'evt-1',
      },
      method: 'GET',
      url: '/stream',
    });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('id: evt-2');
    expect(stream.body).not.toContain('id: evt-1');
  });

  it('emits a refetch-required control event when the cursor is stale', async () => {
    await publish('tenant-stale', 'stale-1', { n: 1 });

    const stream = await app.inject({
      headers: {
        authorization: await bearer(clientPrincipal('tenant-stale')),
        'last-event-id': 'never-seen',
      },
      method: 'GET',
      url: '/stream',
    });

    expect(stream.body).toContain('event: refetch-required');
    expect(stream.body).toContain('cursor predates retention');
  });

  it('serves only the tenant carried by the token', async () => {
    await publish('tenant-private', 'secret-1', { secret: true });

    const intruder = await app.inject({
      headers: { authorization: await bearer(clientPrincipal('tenant-other')) },
      method: 'GET',
      url: '/stream',
    });

    expect(intruder.body).not.toContain('secret-1');
    expect(intruder.body).toContain('connected');
  });

  it('lets an owner read only an explicitly scoped tenant', async () => {
    await publish('tenant-scoped', 'owner-visible-1', { n: 1 });

    const scoped = await app.inject({
      headers: { authorization: await bearer(ownerPrincipal('tenant-scoped')) },
      method: 'GET',
      url: '/stream',
    });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.body).toContain('owner-visible-1');

    const unscoped = await app.inject({
      headers: { authorization: await bearer(ownerPrincipal(null)) },
      method: 'GET',
      url: '/stream',
    });
    expect(unscoped.statusCode).toBe(403);
    expect(unscoped.body).toContain('NO_TENANT_SCOPE');
  });

  it('rejects an expired owner tenant scope', async () => {
    const expired = await app.inject({
      headers: {
        authorization: await bearer(
          ownerPrincipal('tenant-scoped', new Date(Date.now() - 1_000)),
        ),
      },
      method: 'GET',
      url: '/stream',
    });

    expect(expired.statusCode).toBe(403);
    expect(expired.body).toContain('NO_TENANT_SCOPE');
  });

  it('pushes events appended after the connection opened', async () => {
    // The stream stays open, so an event published mid-connection must arrive on
    // the same socket rather than waiting for the client to reconnect.
    const stream = app.inject({
      headers: { authorization: await bearer(clientPrincipal('tenant-push')) },
      method: 'GET',
      url: '/stream',
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    await publish('tenant-push', 'push-1', { n: 1 });

    const response = await stream;
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('id: push-1');
  });

  it('rejects an incomplete publish payload', async () => {
    const response = await app.inject({
      headers: { authorization: publisher },
      method: 'POST',
      payload: { data: { ok: true } },
      url: '/publish/tenant-a',
    });

    expect(response.statusCode).toBe(400);
  });
});
