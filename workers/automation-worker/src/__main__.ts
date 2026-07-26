import { createDatabase, withTenantTransaction } from '@chai/database';

import { API_TENANT_ID, SERVICE_PRINCIPAL_ID } from './constants';
import { claimDueJobs, completeJob, scheduleFollowUp } from './repository';

/**
 * Self-check: claimDueJobs only returns rows past due_at.
 * Run: node --import tsx/esm workers/automation-worker/src/__main__.ts
 * Requires DATABASE_URL pointing at a migrated runtime DB.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const database = createDatabase(url);

  const now = new Date();
  let pastId = '';
  let futureId = '';

  await withTenantTransaction(
    database,
    { principalId: SERVICE_PRINCIPAL_ID, tenantId: API_TENANT_ID },
    async (tx) => {
      const past = await scheduleFollowUp(tx, {
        tenantId: API_TENANT_ID,
        dueAt: new Date(now.getTime() - 60_000),
        payload: { self: 'past' },
      });
      pastId = past.id;
      const future = await scheduleFollowUp(tx, {
        tenantId: API_TENANT_ID,
        dueAt: new Date(now.getTime() + 60_000),
        payload: { self: 'future' },
      });
      futureId = future.id;
    },
  );

  const claimed = await withTenantTransaction(
    database,
    { principalId: SERVICE_PRINCIPAL_ID, tenantId: API_TENANT_ID },
    (tx) => claimDueJobs(tx, API_TENANT_ID, now),
  );
  const claimedIds = new Set(claimed.map((j) => j.id));
  assert(claimedIds.has(pastId), 'past-due job must be claimed');
  assert(!claimedIds.has(futureId), 'future job must NOT be claimed');

  await withTenantTransaction(
    database,
    { principalId: SERVICE_PRINCIPAL_ID, tenantId: API_TENANT_ID },
    async (tx) => {
      await completeJob(tx, pastId);
    },
  );

  console.log('self-check OK: claimDueJobs honors due_at; past claimed, future skipped.');
  await database.end();
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`assert failed: ${message}`);
}

void main().catch((error) => {
  console.error('self-check FAILED', error);
  process.exitCode = 1;
});
