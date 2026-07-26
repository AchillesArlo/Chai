import { randomUUID } from 'node:crypto';

import { createDatabase } from '@chai/database';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { AutomationService } from '../../src/modules/automation/automation.service';

const adminDatabaseUrl = inject('adminDatabaseUrl');
const runtimeDatabaseUrl = inject('runtimeDatabaseUrl');

const admin = createDatabase(adminDatabaseUrl);

const TENANT_ID = API_TENANT_ID;
const CONTACT_ID = randomUUID();
const CONVERSATION_ID = randomUUID();
const CHANNEL_ACCOUNT_ID = randomUUID();

beforeAll(async () => {
  await admin`
    INSERT INTO chai.tenant (id, slug, name)
    VALUES (${TENANT_ID}, 'automation-test', 'Automation Test Tenant')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO chai.contact (id, tenant_id, display_name)
    VALUES (${CONTACT_ID}, ${TENANT_ID}, 'API Restart Contact')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO chai.conversation (id, tenant_id, contact_id, channel_account_id)
    VALUES (${CONVERSATION_ID}, ${TENANT_ID}, ${CONTACT_ID}, ${CHANNEL_ACCOUNT_ID})
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  await admin.end();
});

describe('API automation scheduling (S2-3)', () => {
  it('schedules a follow-up into chai.follow_up_job that survives an API handle restart', async () => {
    const runtime1 = createDatabase(runtimeDatabaseUrl);
    const service = new AutomationService(runtime1);
    const scheduled = await service.scheduleFollowUp(
      TENANT_ID,
      CONVERSATION_ID,
      new Date(Date.now() - 60_000),
      { kind: 'api-restart' },
    );
    expect(scheduled.status).toBe('PENDING');
    expect(scheduled.id).toBeTruthy();

    // drop the API's DB handle = process death
    await runtime1.end();

    // reconnect from the SAME runtimeUrl; the row must still be there, still PENDING
    const runtime2 = createDatabase(runtimeDatabaseUrl);
    const service2 = new AutomationService(runtime2);
    const rescheduled = await service2.scheduleFollowUp(
      TENANT_ID,
      CONVERSATION_ID,
      new Date(Date.now() - 60_000),
      { kind: 'api-restart-2' },
    );
    expect(rescheduled.status).toBe('PENDING');

    const rows =
      await admin`SELECT status FROM chai.follow_up_job WHERE id = ${scheduled.id}`;
    expect(rows.length).toBe(1);
    expect(rows[0]?.status).toBe('PENDING');
    await runtime2.end();

    await admin`DELETE FROM chai.follow_up_job WHERE id IN (${scheduled.id}, ${rescheduled.id})`;
  });
});
