import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@chai/database';

import {
  API_CHANNEL_ACCOUNT_ID,
  API_CLIENT_OWNER_ID,
  API_CONTACT_ID,
  API_TENANT_ID,
} from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAnalyticsRepository } from '../../src/modules/analytics/postgres-analytics.repository';
import { PostgresConversationRepository } from '../../src/modules/channels/postgres-conversation.repository';
import { PostgresIamRepository } from '../../src/modules/iam/postgres-iam.repository';
import { PostgresLeadsRepository } from '../../src/modules/leads/postgres-leads.repository';

describe('API Postgres repositories (S2-1)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('seeds foundation and lists empty conversations under RLS', async () => {
    const conversations = new PostgresConversationRepository(runtime);
    const listed = await conversations.listConversations(
      API_TENANT_ID,
      API_CLIENT_OWNER_ID,
    );
    expect(Array.isArray(listed)).toBe(true);
  });

  it('ingests inbound event, qualifies lead, books appointment', async () => {
    const conversations = new PostgresConversationRepository(runtime);
    const leads = new PostgresLeadsRepository(runtime);

    const ingest = await conversations.ingest({
      channelAccount: API_CHANNEL_ACCOUNT_ID,
      content: { contentType: 'TEXT', text: 'hello s2-1' },
      direction: 'INBOUND',
      externalEventId: 'api-int-evt-1',
      externalMessageId: 'api-int-msg-1',
      externalUserId: 'wa-user-1',
      provider: 'mock-channel',
      providerTimestamp: new Date('2026-07-19T12:00:00Z'),
      rawReference: 'restricted://mock/api-int-1',
      tenantId: API_TENANT_ID,
    });
    expect(ingest.created).toBe(true);

    await admin`
      INSERT INTO chai.lead (id, tenant_id, contact_id, source, stage, status, score)
      VALUES (
        '01890f47-9b3c-7cc2-98e8-1234567893e1',
        ${API_TENANT_ID},
        ${API_CONTACT_ID},
        'mock-channel',
        'NEW',
        'OPEN',
        0
      )
      ON CONFLICT (id) DO NOTHING
    `;

    const qualified = await leads.qualifyLead(
      API_TENANT_ID,
      '01890f47-9b3c-7cc2-98e8-1234567893e1',
      80,
    );
    expect(qualified?.score).toBe(80);
    expect(qualified?.stage).toBe('QUALIFIED');

    const book = await leads.bookAppointment(API_TENANT_ID, {
      contactId: API_CONTACT_ID,
      endsAt: '2026-08-02T10:00:00.000Z',
      idempotencyKey: 'api-int-appt-1',
      resourceId: 'chair-int-1',
      startsAt: '2026-08-02T09:00:00.000Z',
      title: 'Integration booking',
    });
    expect(book.created).toBe(true);
    expect(book.conflict).toBe(false);
    expect(book.appointment.id).toBeTruthy();

    const conflict = await leads.bookAppointment(API_TENANT_ID, {
      contactId: API_CONTACT_ID,
      endsAt: '2026-08-02T10:00:00.000Z',
      idempotencyKey: 'api-int-appt-2',
      resourceId: 'chair-int-1',
      startsAt: '2026-08-02T09:30:00.000Z',
      title: 'Overlap',
    });
    expect(conflict.conflict).toBe(true);
  });

  it('invites and accepts membership via IAM repo', async () => {
    const iam = new PostgresIamRepository(runtime);
    const inviteeId = '01890f47-9b3c-7cc2-98e8-1234567893f1';

    await admin`
      INSERT INTO chai.user_account (id, external_subject, display_name)
      VALUES (${inviteeId}, 'local|invitee-int', 'Invitee')
      ON CONFLICT (id) DO NOTHING
    `;

    const invited = await iam.createMembership(API_TENANT_ID, {
      role: 'CLIENT_AGENT',
      userId: inviteeId,
    });
    expect(invited.status).toBe('INVITED');

    const accepted = await iam.acceptInvitation(API_TENANT_ID, invited.id);
    expect(accepted?.status).toBe('ACTIVE');

    const roster = await iam.listMemberships(API_TENANT_ID);
    expect(roster.some((member) => member.userId === inviteeId)).toBe(true);
  });

  it('materializes analytics outcomes from live rows', async () => {
    const analytics = new PostgresAnalyticsRepository(runtime);
    const outcomes = await analytics.getOutcomes(API_TENANT_ID);
    expect(outcomes.qualificationRate.denominator).toBeGreaterThanOrEqual(1);
    expect(outcomes.automationRate.denominator).toBeGreaterThanOrEqual(0);
    expect(outcomes.sourceUntil).toBeTruthy();
  });
});
