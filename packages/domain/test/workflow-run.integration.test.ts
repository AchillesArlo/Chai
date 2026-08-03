import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimWorkflowRuns,
  createWorkflowRun,
  getWorkflowRun,
  persistWorkflowStep,
  type WorkflowRun,
} from '../src/workflow/run-store';
import { DOMAIN_IDS, seedFoundation } from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const WORKFLOW_TYPE = 'test.claim-race';

const tenantContext = { principalId: PRINCIPAL_A, tenantId: TENANT_A };

async function resetWorkflowRuns(adminDatabaseUrl: string): Promise<void> {
  const postgres = (await import('postgres')).default;
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`DELETE FROM chai.workflow_run`;
  } finally {
    await admin.end();
  }
}

describe('workflow_run — claim-loop under FOR UPDATE SKIP LOCKED', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('runtimeDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  beforeEach(async () => {
    await resetWorkflowRuns(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetWorkflowRuns(adminDatabaseUrl);
  });

  // Enqueue one PENDING run in its own connection and return it, so no test
  // needs a mutable placeholder id.
  async function createPendingRun(): Promise<WorkflowRun> {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      return await withTenantTransaction(runtime, tenantContext, (tx) =>
        createWorkflowRun(tx, {
          tenantId: TENANT_A,
          workflowType: WORKFLOW_TYPE,
        }),
      );
    } finally {
      await runtime.end();
    }
  }

  it('lets exactly one of two concurrent claimers win a single PENDING run', async () => {
    const created = await createPendingRun();
    expect(created.status).toBe('PENDING');
    const runId = created.id;

    // Two independent worker connections so their transactions are truly
    // concurrent — one shared connection would serialise them.
    const workerA = createDatabase(workerDatabaseUrl);
    const workerB = createDatabase(workerDatabaseUrl);

    let signalLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      // Worker A claims and then HOLDS its transaction open (row locked,
      // uncommitted) until we release it — the window during which B races.
      const claimA = withTenantTransaction(workerA, tenantContext, async (tx) => {
        const runs = await claimWorkflowRuns(tx, {
          workflowType: WORKFLOW_TYPE,
          staleAfterMs: 60_000,
        });
        signalLocked();
        await gate;
        return runs;
      });

      // Only start B once A definitely holds the lock, so the outcome is
      // deterministic: B must SKIP LOCKED past the row A is holding.
      await locked;
      const claimB = await withTenantTransaction(workerB, tenantContext, (tx) =>
        claimWorkflowRuns(tx, {
          workflowType: WORKFLOW_TYPE,
          staleAfterMs: 60_000,
        }),
      );

      release();
      const claimAResult = await claimA;

      const claimedByA = claimAResult.map((run) => run.id);
      const claimedByB = claimB.map((run) => run.id);

      // Exactly one worker got the run; the other got nothing.
      expect(claimedByA.length + claimedByB.length).toBe(1);
      expect([...claimedByA, ...claimedByB]).toEqual([runId]);
      // The winner moved it out of PENDING into RUNNING.
      expect([...claimAResult, ...claimB][0]?.status).toBe('RUNNING');
    } finally {
      await workerA.end();
      await workerB.end();
    }

    // After both transactions settle, the row is RUNNING exactly once.
    const verify = createDatabase(runtimeDatabaseUrl);
    try {
      const run = await withTenantTransaction(verify, tenantContext, (tx) =>
        getWorkflowRun(tx, runId),
      );
      expect(run?.status).toBe('RUNNING');
    } finally {
      await verify.end();
    }
  });

  it('re-claims a stale RUNNING run but not a fresh one', async () => {
    const runId = (await createPendingRun()).id;

    const worker = createDatabase(workerDatabaseUrl);
    try {
      // First claim: PENDING -> RUNNING, updated_at = now().
      const first = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimWorkflowRuns(tx, { workflowType: WORKFLOW_TYPE, staleAfterMs: 60_000 }),
      );
      expect(first.map((r) => r.id)).toEqual([runId]);

      // A fresh RUNNING run is NOT re-claimable while its worker is alive.
      const notStale = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimWorkflowRuns(tx, { workflowType: WORKFLOW_TYPE, staleAfterMs: 60_000 }),
      );
      expect(notStale).toHaveLength(0);

      // With staleAfterMs = 0 the RUNNING run is considered abandoned and
      // re-claimable, and KEEPS its RUNNING status (a resume, not a restart).
      const reclaimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimWorkflowRuns(tx, { workflowType: WORKFLOW_TYPE, staleAfterMs: 0 }),
      );
      expect(reclaimed.map((r) => r.id)).toEqual([runId]);
      expect(reclaimed[0]?.status).toBe('RUNNING');
    } finally {
      await worker.end();
    }
  });

  it('refuses an illegal status transition and leaves the run untouched', async () => {
    const created = await createPendingRun();
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      // Drive it to DONE, then try to move a terminal run — must be rejected.
      await withTenantTransaction(runtime, tenantContext, (tx) =>
        persistWorkflowStep(tx, created.id, { status: 'RUNNING' }),
      );
      await withTenantTransaction(runtime, tenantContext, (tx) =>
        persistWorkflowStep(tx, created.id, { status: 'DONE' }),
      );

      const rejected = await withTenantTransaction(runtime, tenantContext, (tx) =>
        persistWorkflowStep(tx, created.id, { status: 'RUNNING' }),
      );
      expect(rejected).toBeNull();

      const after = await withTenantTransaction(runtime, tenantContext, (tx) =>
        getWorkflowRun(tx, created.id),
      );
      expect(after?.status).toBe('DONE');
    } finally {
      await runtime.end();
    }
  });
});
