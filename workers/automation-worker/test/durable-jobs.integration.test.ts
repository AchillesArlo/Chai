import { createDatabase, withTenantTransaction } from '@chai/database';
import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { API_TENANT_ID, SERVICE_PRINCIPAL_ID } from '../src/constants';
import { claimDueJobs, getJob, scheduleFollowUp } from '../src/repository';
import { runAutomationWorker } from '../src/runner';

const adminDatabaseUrl = inject('adminDatabaseUrl');
const workerDatabaseUrl = inject('workerDatabaseUrl');

const admin = createDatabase(adminDatabaseUrl);
const worker = createDatabase(workerDatabaseUrl);

const TENANT_ID = API_TENANT_ID;
const CONTACT_ID = randomUUID();
const CONVERSATION_ID = randomUUID();
const CHANNEL_ACCOUNT_ID = randomUUID();
const principal = { principalId: SERVICE_PRINCIPAL_ID, tenantId: TENANT_ID };

beforeAll(async () => {
  await admin`
    INSERT INTO chai.tenant (id, slug, name)
    VALUES (${TENANT_ID}, 'automation-test', 'Automation Test Tenant')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO chai.contact (id, tenant_id, display_name)
    VALUES (${CONTACT_ID}, ${TENANT_ID}, 'Automation Test Contact')
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
  await worker.end();
});

describe('automation worker durable jobs', () => {
  it('moves a due job PENDING -> CLAIMED -> DONE across a worker iteration', async () => {
    const jobId = await withTenantTransaction(admin, principal, (tx) =>
      scheduleFollowUp(tx, {
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        dueAt: new Date(Date.now() - 60_000),
        payload: { kind: 'happy' },
      }).then((j) => j.id),
    );

    await runAutomationWorker(worker, {
      tenantId: TENANT_ID,
      intervalMs: 10,
      maxIterations: 1,
    });

    const after = await getJob(admin, jobId);
    expect(after?.status).toBe('DONE');
  });

  it('retries a failing job and eventually marks FAILED after max_attempts', async () => {
    const maxAttempts = 2;
    const jobId = await withTenantTransaction(admin, principal, (tx) =>
      scheduleFollowUp(tx, {
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        dueAt: new Date(Date.now() - 60_000),
        payload: { kind: 'sad' },
        maxAttempts,
      }).then((j) => j.id),
    );

    const failingHandler = async (): Promise<void> => {
      throw new Error('intentional failure');
    };

    // Two iterations: first flips PENDING->CLAIMED->back to PENDING (attempt 1),
    // second increments attempt to 2 == max_attempts -> FAILED.
    await runAutomationWorker(worker, {
      tenantId: TENANT_ID,
      intervalMs: 10,
      maxIterations: 1,
      handler: failingHandler,
    });
    let after = await getJob(admin, jobId);
    expect(after?.status).toBe('PENDING');
    expect(after?.attempt).toBe(1);
    expect(after?.last_error).toBe('intentional failure');

    await runAutomationWorker(worker, {
      tenantId: TENANT_ID,
      intervalMs: 10,
      maxIterations: 1,
      handler: failingHandler,
    });
    after = await getJob(admin, jobId);
    expect(after?.status).toBe('FAILED');
    expect(after?.attempt).toBe(2);
  });

  it('claimDueJobs only returns rows whose due_at has passed', async () => {
    const futureId = await withTenantTransaction(admin, principal, (tx) =>
      scheduleFollowUp(tx, {
        tenantId: TENANT_ID,
        dueAt: new Date(Date.now() + 60_000),
        payload: { kind: 'future' },
      }).then((j) => j.id),
    );
    try {
      const claimed = await withTenantTransaction(worker, principal, (tx) =>
        claimDueJobs(tx, TENANT_ID, new Date()),
      );
      expect(claimed.map((j) => j.id)).not.toContain(futureId);
      expect(claimed.every((j) => j.status === 'CLAIMED')).toBe(true);
      // ponytail: cleanup claimed rows so they don't pollute other tests.
      const claimedIds = claimed.map((j) => j.id);
      if (claimedIds.length > 0) {
        await admin`DELETE FROM chai.follow_up_job WHERE id IN ${admin(claimedIds)}`;
      }
    } finally {
      await admin`DELETE FROM chai.follow_up_job WHERE id = ${futureId}`;
    }
  });
});
