import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase, withTenantTransaction } from '@chai/database';
import { redactExpiredInboxPayloads } from '@chai/domain';

import {
  API_SERVICE_PRINCIPAL_ID,
  API_TENANT_ID,
} from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresConversationRepository } from '../../src/modules/channels/postgres-conversation.repository';

/**
 * FASE 29 (T-06): the inbound webhook payload store persists the raw event so a
 * worker can rebuild it, but card/CVV/PIN/OTP/bank data is redacted BEFORE the
 * row is written. This ingests an event whose message body contains a card
 * number and asserts the stored chai.inbox_payload never held it in plaintext.
 */
describe('inbox payload store redacts PII before storage (FASE 29)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;
  let repo: PostgresConversationRepository;

  const cardNumber = '4111 1111 1111 1111';

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

  it('stores the event with the card number already masked', async () => {
    const externalEventId = `payload-evt-${Date.now()}`;
    const ingested = await repo.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930a',
      content: {
        contentType: 'TEXT',
        text: `Nomor kartu saya ${cardNumber}, tolong diproses`,
      },
      direction: 'INBOUND',
      externalEventId,
      externalMessageId: `payload-msg-${Date.now()}`,
      externalUserId: `payload-user-${Date.now()}`,
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock/payload',
      tenantId: API_TENANT_ID,
    });
    expect(ingested.duplicate).toBe(false);

    const rows = await admin<
      { payload: unknown; redacted_at: Date | null }[]
    >`
      SELECT ip.payload, ip.redacted_at
      FROM chai.inbox_payload ip
      JOIN chai.inbox_event ie ON ie.id = ip.inbox_event_id
      WHERE ie.external_event_id = ${externalEventId}
        AND ip.tenant_id = ${API_TENANT_ID}
      LIMIT 1
    `;
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row).toBeTruthy();
    if (!row) return;
    // Freshly stored, not yet touched by the retention sweep.
    expect(row.redacted_at).toBeNull();

    const serialized = JSON.stringify(row.payload);
    // The card number never reached the table, by value...
    expect(serialized).not.toContain('4111');
    expect(serialized).not.toContain(cardNumber);
    // ...and the masking marker proves redaction ran, not that the field was
    // merely absent.
    expect(serialized).toContain('[REDACTED_CARD]');
  });

  it('redacts payloads older than the 30-day retention window in place', async () => {
    const externalEventId = `retention-evt-${Date.now()}`;
    await repo.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930a',
      content: { contentType: 'TEXT', text: 'halo, ini pesan biasa' },
      direction: 'INBOUND',
      externalEventId,
      externalMessageId: `retention-msg-${Date.now()}`,
      externalUserId: `retention-user-${Date.now()}`,
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock/retention',
      tenantId: API_TENANT_ID,
    });

    // Backdate the stored payload beyond the retention window.
    await admin`
      UPDATE chai.inbox_payload ip
      SET created_at = now() - interval '40 days'
      FROM chai.inbox_event ie
      WHERE ie.id = ip.inbox_event_id
        AND ie.external_event_id = ${externalEventId}
    `;

    const redactedCount = await withTenantTransaction(
      runtime,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId: API_TENANT_ID },
      (tx) => redactExpiredInboxPayloads(tx, 30),
    );
    expect(redactedCount).toBeGreaterThanOrEqual(1);

    const rows = await admin<{ payload: unknown; redacted_at: Date | null }[]>`
      SELECT ip.payload, ip.redacted_at
      FROM chai.inbox_payload ip
      JOIN chai.inbox_event ie ON ie.id = ip.inbox_event_id
      WHERE ie.external_event_id = ${externalEventId}
      LIMIT 1
    `;
    const row = rows[0];
    expect(row).toBeTruthy();
    if (!row) return;
    // Row survives (audit that an event existed), payload replaced, flag stamped.
    expect(row.redacted_at).not.toBeNull();
    expect(JSON.stringify(row.payload)).toContain('redacted');
    expect(JSON.stringify(row.payload)).not.toContain('pesan biasa');
  });
});
