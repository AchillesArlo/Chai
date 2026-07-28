import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_CLIENT_OWNER_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresConversationRepository } from '../../src/modules/channels/postgres-conversation.repository';

/**
 * K-03 regression: the `message.created` outbox payload is published to the
 * Redis stream, which sits outside Postgres RLS, outside the retention job,
 * and outside the PII redaction pipeline. The customer's message body must
 * therefore never enter it — consumers read chai.message by messageId under
 * tenant RLS instead (payload-by-reference).
 *
 * This asserts on the row actually written to chai.outbox_event, which is what
 * the broker publisher serialises, rather than on the producer's source text.
 */
describe('message.created outbox payload carries no message body (K-03)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;
  let repo: PostgresConversationRepository;

  const secretText = 'Nomor kartu saya 4111 1111 1111 1111, tolong dibantu';

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
    repo = new PostgresConversationRepository(runtime);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('publishes messageId but not text', async () => {
    const externalUserId = `k03-${Date.now()}`;
    const ingested = await repo.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930a',
      content: { contentType: 'TEXT', text: 'halo' },
      direction: 'INBOUND',
      externalEventId: `k03-evt-${Date.now()}`,
      externalMessageId: `k03-msg-${Date.now()}`,
      externalUserId,
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock/k03',
      tenantId: API_TENANT_ID,
    });
    const conversationId = ingested.conversationId;
    expect(conversationId).toBeTruthy();
    if (!conversationId) return;

    const [conversation] = await admin<{ version: number }[]>`
      SELECT version FROM chai.conversation WHERE id = ${conversationId} LIMIT 1
    `;
    expect(conversation).toBeTruthy();

    const sent = await repo.sendMessage(
      API_TENANT_ID,
      conversationId,
      API_CLIENT_OWNER_ID,
      conversation?.version ?? 1,
      { idempotencyKey: `k03-key-${Date.now()}`, text: secretText },
    );
    expect(sent.kind).toBe('ok');

    const events = await admin<{ payload: unknown }[]>`
      SELECT payload
      FROM chai.outbox_event
      WHERE tenant_id = ${API_TENANT_ID}
        AND aggregate_id = ${conversationId}
        AND event_type = 'message.created'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(events).toHaveLength(1);

    const raw = events[0]?.payload;
    const payload = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<
      string,
      unknown
    >;

    // The reference the consumer needs is present...
    expect(payload['messageId']).toBeTruthy();
    expect(payload['conversationId']).toBe(conversationId);
    // ...and the body is absent, by key and by value.
    expect(payload).not.toHaveProperty('text');
    expect(JSON.stringify(payload)).not.toContain('4111');
    expect(JSON.stringify(payload)).not.toContain(secretText);

    // The body itself is still persisted in Postgres, where RLS protects it.
    const [stored] = await admin<{ text_content: string | null }[]>`
      SELECT text_content FROM chai.message WHERE id = ${String(payload['messageId'])} LIMIT 1
    `;
    expect(stored?.text_content).toBe(secretText);
  });
});
