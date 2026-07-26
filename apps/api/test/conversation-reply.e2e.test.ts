import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { API_TENANT_ID, API_TENANT_B_ID } from '../src/database/api-ids';
import { ChannelsModule } from '../src/modules/channels/channels.module';
import type { InMemoryConversationRepository } from '../src/modules/channels/in-memory-conversation.repository';
import {
  ConversationRepository,
  type OutboundMessageSummary,
} from '../src/modules/shared/conversation.port';

/**
 * Task #5a: operator reply endpoint. These fail if a reply stops producing an
 * outbox event, if a repeated Idempotency-Key duplicates the outbound message,
 * or if one tenant can reply into another tenant's conversation.
 */

const CHANNEL_ACCOUNT = '01890f47-9b3c-7cc2-98e8-12345678930a';

function seed(tenantId: string, suffix: string) {
  return {
    channelAccount: CHANNEL_ACCOUNT,
    content: { contentType: 'TEXT' as const, text: `halo ${suffix}` },
    direction: 'INBOUND' as const,
    externalEventId: `reply-evt-${suffix}`,
    externalMessageId: `reply-msg-${suffix}`,
    externalUserId: `reply-customer-${suffix}`,
    provider: 'mock-channel',
    providerTimestamp: new Date(),
    rawReference: `restricted://mock-channel/reply-evt-${suffix}`,
    tenantId,
  };
}

describe('operator reply — POST /api/client/v1/conversations/:id/messages', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryConversationRepository;
  let conversationId: string;
  let foreignConversationId: string;
  let firstReply: OutboundMessageSummary;

  async function versionOf(tenantId: string, id: string): Promise<number> {
    const rows = await repository.listConversations(tenantId);
    const row = rows.find((item) => item.id === id);
    if (!row) throw new Error(`conversation ${id} missing`);
    return row.version;
  }

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    repository = app
      .select(ChannelsModule)
      .get(ConversationRepository) as InMemoryConversationRepository;

    const created = await repository.ingest(seed(API_TENANT_ID, 'a'));
    if (!created.conversationId) throw new Error('expected a seeded conversation');
    conversationId = created.conversationId;

    const foreign = await repository.ingest(seed(API_TENANT_B_ID, 'b'));
    if (!foreign.conversationId) throw new Error('expected a seeded foreign conversation');
    foreignConversationId = foreign.conversationId;
  });

  afterAll(async () => app.close());

  it('stores the reply as OUTBOUND/HUMAN and emits one outbox event', async () => {
    const version = await versionOf(API_TENANT_ID, conversationId);
    const response = await app.inject({
      headers: {
        'idempotency-key': 'reply-key-1',
        'if-match': `"${version}"`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { text: 'Terima kasih, kami bantu ya' },
      url: `/api/client/v1/conversations/${conversationId}/messages`,
    });

    expect(response.statusCode).toBe(201);
    firstReply = response.json().data as OutboundMessageSummary;
    expect(firstReply.direction).toBe('OUTBOUND');
    expect(firstReply.senderType).toBe('HUMAN');
    expect(firstReply.text).toBe('Terima kasih, kami bantu ya');
    expect(firstReply.id).toBeTruthy();

    expect(repository.messagesFor(conversationId)).toHaveLength(1);
    const events = repository.replyEventsFor(conversationId);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('message.created');
    expect(events[0]?.aggregateVersion).toBe(version + 1);
  });

  it('replays the same message for a repeated Idempotency-Key without duplicating', async () => {
    // A retry legitimately carries a now-stale If-Match; the replay must still
    // return the first message rather than surface a version conflict.
    const response = await app.inject({
      headers: {
        'idempotency-key': 'reply-key-1',
        'if-match': '"1"',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { text: 'Terima kasih, kami bantu ya' },
      url: `/api/client/v1/conversations/${conversationId}/messages`,
    });

    expect(response.statusCode).toBe(201);
    const data = response.json().data as OutboundMessageSummary;
    expect(data.id).toBe(firstReply.id);
    expect(repository.messagesFor(conversationId)).toHaveLength(1);
    expect(repository.replyEventsFor(conversationId)).toHaveLength(1);
  });

  it('refuses a guarded reply with no If-Match precondition', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'reply-key-no-ifmatch',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { text: 'no precondition' },
      url: `/api/client/v1/conversations/${conversationId}/messages`,
    });

    expect(response.statusCode).toBe(428);
    expect(response.body).toContain('PRECONDITION_REQUIRED');
  });

  it('does not let one tenant reply into another tenant conversation', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'reply-key-foreign',
        'if-match': '"1"',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { text: 'should never land' },
      url: `/api/client/v1/conversations/${foreignConversationId}/messages`,
    });

    expect(response.statusCode).toBe(404);
    expect(repository.messagesFor(foreignConversationId)).toHaveLength(0);
  });

  it('rejects the same Idempotency-Key with a different body as a conflict', async () => {
    const firstVersion = await versionOf(API_TENANT_ID, conversationId);
    const first = await app.inject({
      headers: {
        'idempotency-key': 'reply-key-conflict',
        'if-match': `"${firstVersion}"`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { text: 'original body' },
      url: `/api/client/v1/conversations/${conversationId}/messages`,
    });
    expect(first.statusCode).toBe(201);

    const nextVersion = await versionOf(API_TENANT_ID, conversationId);
    const conflict = await app.inject({
      headers: {
        'idempotency-key': 'reply-key-conflict',
        'if-match': `"${nextVersion}"`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { text: 'a different body under the same key' },
      url: `/api/client/v1/conversations/${conversationId}/messages`,
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
