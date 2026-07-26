import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { API_TENANT_ID, SERVICE_PRINCIPAL_ID } from '../src/constants';
import { executeFollowUp } from '../src/main';
import { getJob, scheduleFollowUp } from '../src/repository';
import { runAutomationWorker } from '../src/runner';

const adminDatabaseUrl = inject('adminDatabaseUrl');
const workerDatabaseUrl = inject('workerDatabaseUrl');

const admin = createDatabase(adminDatabaseUrl);
const worker = createDatabase(workerDatabaseUrl);

const TENANT_ID = API_TENANT_ID;
const principal = { principalId: SERVICE_PRINCIPAL_ID, tenantId: TENANT_ID };

beforeAll(async () => {
  await admin`
    INSERT INTO chai.tenant (id, slug, name)
    VALUES (${TENANT_ID}, 'automation-test', 'Automation Test Tenant')
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  await admin.end();
  await worker.end();
});

/**
 * The deployed automation worker (main.ts) runs the REAL job loop with
 * `executeFollowUp`. This fails if that pipe regresses to the old inbox no-op
 * (the job would stay PENDING forever) OR if the handler fabricates success (the
 * job would be silently DONE). The only honest outcome, until the send action
 * exists, is FAILED with a clear reason.
 */
describe('automation worker deployed pipe (S2-3)', () => {
  it('claims a due job and FAILS it with a clear reason instead of DONE or PENDING', async () => {
    const jobId = await withTenantTransaction(admin, principal, (tx) =>
      scheduleFollowUp(tx, {
        tenantId: TENANT_ID,
        conversationId: null,
        dueAt: new Date(Date.now() - 60_000),
        payload: { kind: 'deployed-handler' },
        maxAttempts: 1,
      }).then((j) => j.id),
    );

    try {
      await runAutomationWorker(worker, {
        tenantId: TENANT_ID,
        intervalMs: 10,
        maxIterations: 1,
        handler: executeFollowUp,
      });

      const after = await getJob(admin, jobId);
      expect(after?.status).toBe('FAILED');
      expect(after?.status).not.toBe('DONE');
      expect(after?.status).not.toBe('PENDING');
      expect(after?.attempt).toBe(1);
      expect(after?.last_error).toContain('not implemented');
    } finally {
      await admin`DELETE FROM chai.follow_up_job WHERE id = ${jobId}`;
    }
  });
});
