import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../../src/bootstrap';

/**
 * Chaos pilot cases for Stage 1 (Task 14):
 * duplicate delivery, out-of-order bursts, and safe provider failure.
 * Load/soak/backup remain scheduled ops — not CI-blocking here.
 */
describe('e2e chaos — duplicate, burst, provider failure', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('collapses a duplicate webhook burst into one conversation', async () => {
    const payload = {
      external_message_id: 'chaos-dup-msg',
      external_user_id: 'chaos-dup-user',
      text: 'halo',
    };

    for (let i = 0; i < 5; i += 1) {
      const accepted = await app.inject({
        method: 'POST',
        payload: {
          ...payload,
          external_event_id: `chaos-dup-evt-${i}`,
        },
        url: '/api/service/v1/channels/mock-channel/webhook',
      });
      expect(accepted.statusCode).toBe(201);
    }

    const conversations = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const data = conversations.json().data as Array<{ externalUserId: string }>;
    expect(data.filter((row) => row.externalUserId === 'chaos-dup-user')).toHaveLength(
      1,
    );
  });

  it('accepts out-of-order event ids without creating split identities', async () => {
    const user = 'chaos-ooo-user';
    const later = await app.inject({
      method: 'POST',
      payload: {
        external_event_id: 'chaos-ooo-2',
        external_message_id: 'chaos-ooo-msg-2',
        external_user_id: user,
        text: 'second arrived first',
        timestamp: '2026-07-19T12:00:02Z',
      },
      url: '/api/service/v1/channels/mock-channel/webhook',
    });
    expect(later.statusCode).toBe(201);

    const earlier = await app.inject({
      method: 'POST',
      payload: {
        external_event_id: 'chaos-ooo-1',
        external_message_id: 'chaos-ooo-msg-1',
        external_user_id: user,
        text: 'first arrived second',
        timestamp: '2026-07-19T12:00:01Z',
      },
      url: '/api/service/v1/channels/mock-channel/webhook',
    });
    expect(earlier.statusCode).toBe(201);

    const conversations = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const data = conversations.json().data as Array<{ externalUserId: string }>;
    expect(data.filter((row) => row.externalUserId === user)).toHaveLength(1);
  });

  it('fails closed on unknown provider (simulated provider outage path)', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: {
        external_event_id: 'chaos-outage',
        external_message_id: 'chaos-outage-msg',
        external_user_id: 'chaos-outage-user',
        text: 'should not land',
      },
      url: '/api/service/v1/channels/down-provider/webhook',
    });

    expect(response.statusCode).toBe(404);

    const conversations = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const data = conversations.json().data as Array<{ externalUserId: string }>;
    expect(data.map((row) => row.externalUserId)).not.toContain('chaos-outage-user');
  });

  it('rejects malformed webhook payloads without accepting events', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { garbage: true },
      url: '/api/service/v1/channels/mock-channel/webhook',
    });

    expect(response.statusCode).toBe(400);
  });

  it('denies unauthenticated client reads during chaos', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/client/v1/conversations',
    });

    expect(response.statusCode).toBe(401);
  });
});
