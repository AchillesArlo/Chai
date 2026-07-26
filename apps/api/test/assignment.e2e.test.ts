import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { ChannelsModule } from '../src/modules/channels/channels.module';
import { ConversationRepository } from '../src/modules/shared/conversation.port';
import type { InMemoryConversationRepository } from '../src/modules/channels/in-memory-conversation.repository';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-123456789203';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-123456789204';

function requireRow(
  rows: Array<{ id: string; version: number }>,
  conversationId: string,
): { id: string; version: number } {
  const row = rows.find((item) => item.id === conversationId);
  if (!row) throw new Error(`conversation ${conversationId} missing from list`);
  return row;
}

describe('assignment API — takeover / resume-ai / resolve', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryConversationRepository;
  let conversationId: string;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    repository = app
      .select(ChannelsModule)
      .get(ConversationRepository) as InMemoryConversationRepository;

    const created = await repository.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930a',
      content: { contentType: 'TEXT', text: 'butuh agent' },
      direction: 'INBOUND',
      externalEventId: 'asg-evt-1',
      externalMessageId: 'asg-msg-1',
      externalUserId: 'asg-customer',
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock-channel/asg-evt-1',
      tenantId: TENANT_A,
    });
    // A fresh event is never a duplicate, so the id is present.
    if (!created.conversationId) throw new Error('expected an ingested conversation');
    conversationId = created.conversationId;

    await repository.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930b',
      content: { contentType: 'TEXT', text: 'foreign' },
      direction: 'INBOUND',
      externalEventId: 'asg-evt-b',
      externalMessageId: 'asg-msg-b',
      externalUserId: 'foreign-customer',
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock-channel/asg-evt-b',
      tenantId: TENANT_B,
    });
  });

  afterAll(async () => app.close());

  it('takes over a conversation with matching expectedVersion', async () => {
    const list = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const row = requireRow(
      list.json().data as Array<{ id: string; version: number }>,
      conversationId,
    );

    const response = await app.inject({
      headers: {
        'idempotency-key': 'asg-takeover-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { expectedVersion: row.version },
      url: `/api/client/v1/conversations/${conversationId}/takeover`,
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as {
      mode: string;
      version: number;
      assigneeUserId: string | null;
    };
    expect(data.mode).toBe('HUMAN_ACTIVE');
    expect(data.assigneeUserId).toBeTruthy();
    expect(data.version).toBe(row.version + 1);
  });

  it('rejects a stale expectedVersion with VERSION_CONFLICT', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'asg-takeover-stale',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { expectedVersion: 1 },
      url: `/api/client/v1/conversations/${conversationId}/takeover`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('VERSION_CONFLICT');
  });

  it('resumes AI when expectedVersion matches', async () => {
    const list = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const row = requireRow(
      list.json().data as Array<{ id: string; version: number }>,
      conversationId,
    );

    const response = await app.inject({
      headers: {
        'idempotency-key': 'asg-resume-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { expectedVersion: row.version },
      url: `/api/client/v1/conversations/${conversationId}/resume-ai`,
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as {
      mode: string;
      assigneeUserId: string | null;
    };
    expect(data.mode).toBe('AI_ACTIVE');
    expect(data.assigneeUserId).toBeNull();
  });

  it('returns 404 for a foreign conversation id', async () => {
    const foreignList = await repository.listConversations(TENANT_B);
    const foreignId = foreignList[0]?.id;
    expect(foreignId).toBeDefined();
    if (!foreignId) throw new Error('foreign conversation missing');

    const response = await app.inject({
      headers: {
        'idempotency-key': 'asg-foreign',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { expectedVersion: 1 },
      url: `/api/client/v1/conversations/${foreignId}/takeover`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('resolves a conversation under expectedVersion', async () => {
    const list = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const row = requireRow(
      list.json().data as Array<{ id: string; version: number }>,
      conversationId,
    );

    const response = await app.inject({
      headers: {
        'idempotency-key': 'asg-resolve-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { expectedVersion: row.version },
      url: `/api/client/v1/conversations/${conversationId}/resolve`,
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as { status: string; mode: string };
    expect(data.status).toBe('RESOLVED');
    expect(data.mode).toBe('PAUSED');
  });
});
