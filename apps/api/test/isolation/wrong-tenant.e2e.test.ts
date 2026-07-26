import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../../src/bootstrap';
import { ChannelsModule } from '../../src/modules/channels/channels.module';
import { ConversationRepository } from '../../src/modules/shared/conversation.port';
import type { InMemoryConversationRepository } from '../../src/modules/channels/in-memory-conversation.repository';
import { IamModule } from '../../src/modules/iam/iam.module';
import { IamRepository } from '../../src/modules/iam/iam.repository';
import type { InMemoryIamRepository } from '../../src/modules/iam/in-memory-iam.repository';
import { LeadsModule } from '../../src/modules/leads/leads.module';
import {
  LeadsRepository,
  type InMemoryLeadsRepository,
} from '../../src/modules/leads/leads.repository';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-123456789203';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-123456789204';
const FOREIGN_MEMBERSHIP_ID = '01890f47-9b3c-7cc2-98e8-123456789391';
const FOREIGN_LEAD_ID = '01890f47-9b3c-7cc2-98e8-123456789392';

/**
 * Release-blocking wrong-tenant matrix (Task 14 pilot gate).
 * Any leak here blocks Stage 1 promotion.
 */
describe('e2e isolation — wrong-tenant matrix', () => {
  let app: NestFastifyApplication;
  let conversations: InMemoryConversationRepository;
  let iam: InMemoryIamRepository;
  let leads: InMemoryLeadsRepository;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    conversations = app
      .select(ChannelsModule)
      .get(ConversationRepository) as InMemoryConversationRepository;
    iam = app.select(IamModule).get(IamRepository) as InMemoryIamRepository;
    leads = app
      .select(LeadsModule)
      .get(LeadsRepository) as InMemoryLeadsRepository;

    await conversations.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930b',
      content: { contentType: 'TEXT', text: 'secret tenant B' },
      direction: 'INBOUND',
      externalEventId: 'iso-evt-b',
      externalMessageId: 'iso-msg-b',
      externalUserId: 'foreign-customer',
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock-channel/iso-evt-b',
      tenantId: TENANT_B,
    });

    iam.seed({
      id: FOREIGN_MEMBERSHIP_ID,
      role: 'CLIENT_OWNER',
      tenantId: TENANT_B,
      userId: '01890f47-9b3c-7cc2-98e8-123456789333',
    });

    leads.seedLead({
      contactId: 'foreign-contact',
      id: FOREIGN_LEAD_ID,
      score: 99,
      stage: 'QUALIFIED',
      status: 'OPEN',
      tenantId: TENANT_B,
    });
  });

  afterAll(async () => app.close());

  it('lists conversations only for the caller tenant', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as Array<{ externalUserId: string }>;
    expect(data.map((row) => row.externalUserId)).not.toContain('foreign-customer');
  });

  it('lists team members only for the caller tenant', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/team',
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as Array<{ id: string; userId: string }>;
    expect(data.map((row) => row.id)).not.toContain(FOREIGN_MEMBERSHIP_ID);
    expect(data.map((row) => row.userId)).not.toContain(
      '01890f47-9b3c-7cc2-98e8-123456789333',
    );
  });

  it('lists leads only for the caller tenant', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/leads',
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as Array<{ id: string }>;
    expect(data.map((row) => row.id)).not.toContain(FOREIGN_LEAD_ID);
  });

  it('returns 404 when mutating a foreign membership id', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'iso-mutate-foreign-member',
        'x-test-subject': 'local|client-owner',
      },
      method: 'PATCH',
      payload: { role: 'CLIENT_ADMIN' },
      url: `/api/client/v1/team/${FOREIGN_MEMBERSHIP_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when qualifying a foreign lead id', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'iso-qualify-foreign-lead',
        'x-test-subject': 'local|client-owner',
      },
      method: 'PATCH',
      payload: { score: 1 },
      url: `/api/client/v1/leads/${FOREIGN_LEAD_ID}/qualify`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a client switching into another tenant via x-tenant-id', async () => {
    const response = await app.inject({
      headers: {
        'x-tenant-id': TENANT_B,
        'x-test-subject': 'local|client-owner',
      },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a guessed foreign tenant context without owner scope', async () => {
    const response = await app.inject({
      headers: {
        'x-tenant-id': TENANT_B,
        'x-test-subject': 'local|owner-roleless',
      },
      method: 'GET',
      url: '/api/client/v1/team',
    });

    expect([403, 404]).toContain(response.statusCode);
  });

  it('keeps tenant A data visible after foreign seeds', async () => {
    await conversations.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930a',
      content: { contentType: 'TEXT', text: 'tenant A ok' },
      direction: 'INBOUND',
      externalEventId: 'iso-evt-a',
      externalMessageId: 'iso-msg-a',
      externalUserId: 'home-customer',
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock-channel/iso-evt-a',
      tenantId: TENANT_A,
    });

    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });

    const data = response.json().data as Array<{ externalUserId: string }>;
    expect(data.map((row) => row.externalUserId)).toContain('home-customer');
    expect(data.map((row) => row.externalUserId)).not.toContain('foreign-customer');
  });
});
