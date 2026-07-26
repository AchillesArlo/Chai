import { randomUUID } from 'node:crypto';

import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { API_TENANT_ID, SERVICE_PRINCIPAL_ID } from '../src/constants';
import { getJob, scheduleFollowUp } from '../src/repository';
import { runAutomationWorker } from '../src/runner';

const adminDatabaseUrl = inject('adminDatabaseUrl');
const runtimeDatabaseUrl = inject('runtimeDatabaseUrl');

const admin = createDatabase(adminDatabaseUrl);

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
    VALUES (${CONTACT_ID}, ${TENANT_ID}, 'Restart Durability Contact')
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

describe('automation worker restart durability (S2-3)', () => {
  it('a queued job survives a process restart and reaches DONE', async () => {
    const jobId = await withTenantTransaction(admin, principal, (tx) =>
      scheduleFollowUp(tx, {
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        dueAt: new Date(Date.now() - 60_000),
        payload: { kind: 'restart-done' },
      }).then((j) => j.id),
    );

    try {
      // --- "process #1": schedule present, runner NOT started, then die ---
      const db1 = createDatabase(runtimeDatabaseUrl);
      const before = await withTenantTransaction(db1, principal, (tx) =>
        getJob(tx, jobId),
      );
      expect(before?.status).toBe('PENDING');
      await db1.end(); // simulate process death

      // --- "process #2": fresh handle, same DB, run one iteration ---
      const db2 = createDatabase(runtimeDatabaseUrl);
      await runAutomationWorker(db2, {
        tenantId: TENANT_ID,
        maxIterations: 1,
        intervalMs: 10,
        handler: async () => {
          /* success */
        },
      });
      const after = await withTenantTransaction(db2, principal, (tx) =>
        getJob(tx, jobId),
      );
      await db2.end();

      expect(after?.status).toBe('DONE');
      expect(after?.attempt).toBe(0);
    } finally {
      await admin`DELETE FROM chai.follow_up_job WHERE id = ${jobId}`;
    }
  });

  it('a failing job increments attempt across restarts and reaches FAILED at max_attempts', async () => {
    const jobId = await withTenantTransaction(admin, principal, (tx) =>
      scheduleFollowUp(tx, {
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        dueAt: new Date(Date.now() - 60_000),
        payload: { kind: 'restart-fail' },
        maxAttempts: 2,
      }).then((j) => j.id),
    );

    try {
      // --- iteration #1 on db1: handler throws, attempt 0 -> 1, stays PENDING ---
      const db1 = createDatabase(runtimeDatabaseUrl);
      await runAutomationWorker(db1, {
        tenantId: TENANT_ID,
        maxIterations: 1,
        intervalMs: 10,
        handler: async () => {
          throw new Error('boom-1');
        },
      });
      const after1 = await withTenantTransaction(db1, principal, (tx) =>
        getJob(tx, jobId),
      );
      expect(after1?.attempt).toBe(1);
      expect(after1?.status).toBe('PENDING');
      expect(after1?.last_error).toContain('boom-1');
      await db1.end(); // simulate process death

      // --- iteration #2 on db2: handler throws again, attempt 1 -> 2, FAILED ---
      const db2 = createDatabase(runtimeDatabaseUrl);
      await runAutomationWorker(db2, {
        tenantId: TENANT_ID,
        maxIterations: 1,
        intervalMs: 10,
        handler: async () => {
          throw new Error('boom-2');
        },
      });
      const after2 = await withTenantTransaction(db2, principal, (tx) =>
        getJob(tx, jobId),
      );
      await db2.end();

      expect(after2?.attempt).toBe(2);
      expect(after2?.status).toBe('FAILED');
      expect(after2?.last_error).toContain('boom-2');
    } finally {
      await admin`DELETE FROM chai.follow_up_job WHERE id = ${jobId}`;
    }
  });
});
