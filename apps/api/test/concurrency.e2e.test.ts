import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { ChannelsModule } from '../src/modules/channels/channels.module';
import { ConversationRepository } from '../src/modules/shared/conversation.port';

/**
 * Fase 1 / GAP-006 regression: guarded mutations must carry a precondition.
 *
 * These fail if `If-Match` stops being honoured, if a guarded mutation silently
 * falls back to last-write-wins, or if a stale precondition stops producing a
 * version conflict.
 */

const TENANT_A = '01890f47-9b3c-7cc2-98e8-123456789203';

describe('optimistic concurrency via If-Match', () => {
  let app: NestFastifyApplication;
  let conversationId: string;
  let version: number;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const repository = app.select(ChannelsModule).get(ConversationRepository);
    const created = await repository.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-1234567893a1',
      content: { contentType: 'TEXT', text: 'butuh agent' },
      direction: 'INBOUND',
      externalEventId: 'ifmatch-evt-1',
      externalMessageId: 'ifmatch-msg-1',
      externalUserId: 'ifmatch-customer',
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock-channel/ifmatch-evt-1',
      tenantId: TENANT_A,
    });
    if (!created.conversationId) throw new Error('expected an ingested conversation');
    conversationId = created.conversationId;
    const summaries = await repository.listConversations(TENANT_A);
    version = summaries.find((row) => row.id === conversationId)?.version ?? 0;
    expect(version).toBeGreaterThan(0);
  });

  afterAll(async () => app.close());

  it('refuses a guarded mutation with no precondition at all', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ifmatch-none-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {},
      url: `/api/client/v1/conversations/${conversationId}/takeover`,
    });

    expect(response.statusCode).toBe(428);
    expect(response.body).toContain('PRECONDITION_REQUIRED');
  });

  it('rejects a malformed If-Match', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ifmatch-bad-1',
        'if-match': 'not-a-version',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {},
      url: `/api/client/v1/conversations/${conversationId}/takeover`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a body version that disagrees with If-Match', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ifmatch-disagree-1',
        'if-match': `"${version}"`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { expectedVersion: version + 5 },
      url: `/api/client/v1/conversations/${conversationId}/takeover`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a stale precondition with a version conflict', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ifmatch-stale-1',
        'if-match': `"${version + 99}"`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {},
      url: `/api/client/v1/conversations/${conversationId}/takeover`,
    });

    expect(response.statusCode).toBe(409);
  });

  it('accepts a weak entity tag carrying the current version', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ifmatch-ok-1',
        'if-match': `W/"${version}"`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {},
      url: `/api/client/v1/conversations/${conversationId}/takeover`,
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as { mode: string; version: number };
    expect(data.mode).toBe('HUMAN_ACTIVE');
    expect(data.version).toBe(version + 1);
  });
});
