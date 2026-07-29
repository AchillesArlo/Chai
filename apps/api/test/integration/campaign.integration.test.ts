import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import {
  API_CONTACT_ID,
  API_TENANT_B_ID,
  API_TENANT_ID,
} from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresCampaignRepository } from '../../src/modules/campaign/postgres-campaign.repository';

describe('API Postgres campaign repository (D1)', () => {
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

  it('persists a campaign with default metrics and tracks messages', async () => {
    const writer = new PostgresCampaignRepository(runtime);
    const created = await writer.createCampaign(API_TENANT_ID, {
      channel: 'whatsapp',
      messageTemplateId: null,
      name: 'Promo Int',
      scheduledAt: null,
      status: 'DRAFT',
      targetSegment: { region: 'ID' },
      type: 'BROADCAST',
    });
    expect(created.metrics).toEqual({ sent: 0, delivered: 0, read: 0, failed: 0 });

    const reader = new PostgresCampaignRepository(runtime);
    const fetched = await reader.getCampaign(API_TENANT_ID, created.id);
    expect(fetched?.name).toBe('Promo Int');
    expect(fetched?.targetSegment).toEqual({ region: 'ID' });

    const running = await reader.updateCampaign(API_TENANT_ID, created.id, {
      status: 'RUNNING',
    });
    expect(running.status).toBe('RUNNING');

    const message = await reader.createCampaignMessage(API_TENANT_ID, {
      campaignId: created.id,
      contactId: API_CONTACT_ID,
      messageId: null,
      status: 'PENDING',
    });
    const sent = await reader.updateCampaignMessage(API_TENANT_ID, message.id, {
      sentAt: new Date().toISOString(),
      status: 'SENT',
    });
    expect(sent.status).toBe('SENT');
    expect(sent.sentAt).toBeTruthy();

    const messages = await new PostgresCampaignRepository(runtime).listCampaignMessages(
      API_TENANT_ID,
      created.id,
    );
    expect(messages.some((row) => row.id === message.id)).toBe(true);
  });

  it('isolates campaigns by tenant under RLS', async () => {
    const repo = new PostgresCampaignRepository(runtime);
    const mine = await repo.createCampaign(API_TENANT_ID, {
      channel: 'email',
      messageTemplateId: null,
      name: 'Tenant A Only',
      scheduledAt: null,
      status: 'DRAFT',
      targetSegment: null,
      type: 'SEGMENTED',
    });

    const cross = await repo.listCampaigns(API_TENANT_B_ID);
    expect(cross.some((row) => row.id === mine.id)).toBe(false);
    expect(await repo.getCampaign(API_TENANT_B_ID, mine.id)).toBeNull();
  });

  it('stores targetSegment and metrics as real jsonb objects, not a double-encoded string (MASALAH-01)', async () => {
    const repo = new PostgresCampaignRepository(runtime);
    const created = await repo.createCampaign(API_TENANT_ID, {
      channel: 'whatsapp',
      messageTemplateId: null,
      name: 'Jsonb Probe Campaign',
      scheduledAt: null,
      status: 'DRAFT',
      targetSegment: { region: 'ID', tier: 'vip' },
      type: 'BROADCAST',
    });
    const updated = await repo.updateCampaign(API_TENANT_ID, created.id, {
      metrics: { delivered: 3, failed: 0, read: 1, sent: 4 },
      targetSegment: { region: 'SG', tier: 'vip' },
    });
    expect(updated.metrics).toEqual({ delivered: 3, failed: 0, read: 1, sent: 4 });

    // A double-encoded write reads back as jsonb_typeof = 'string' and every
    // key lookup returns NULL: this is the regression 0081 repairs.
    const shape = await admin<{
      segment_type: string;
      segment_val: string | null;
      metrics_type: string;
      metrics_val: string | null;
    }[]>`
      SELECT
        jsonb_typeof(target_segment) AS segment_type,
        target_segment ->> 'region' AS segment_val,
        jsonb_typeof(metrics) AS metrics_type,
        metrics ->> 'sent' AS metrics_val
      FROM chai.campaign WHERE id = ${created.id}::uuid
    `;
    expect(shape[0]?.segment_type).toBe('object');
    expect(shape[0]?.segment_val).toBe('SG');
    expect(shape[0]?.metrics_type).toBe('object');
    expect(shape[0]?.metrics_val).toBe('4');
  });
});
