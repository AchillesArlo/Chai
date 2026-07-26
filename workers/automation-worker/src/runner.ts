import { withTenantTransaction, type Database } from '@chai/database';
import { SERVICE_PRINCIPAL_ID } from './constants';
import { claimDueJobs, completeJob, failJob } from './repository';
import type { FollowUpJob, RunAutomationWorkerOptions } from './types';

const DEFAULT_HANDLER: (job: FollowUpJob) => Promise<void> = async (job) => {
  // ponytail: handler is no-op until AI tool wiring lands in S2-4.
  console.log('automation-worker: processed follow-up job', job.id);
};

export async function runAutomationWorker(
  database: Database,
  options: RunAutomationWorkerOptions,
): Promise<void> {
  const intervalMs = options.intervalMs ?? 1000;
  const maxIterations = options.maxIterations ?? Number.POSITIVE_INFINITY;
  const handler = options.handler ?? DEFAULT_HANDLER;
  const now = options.now ?? (() => new Date());

  let iteration = 0;
  for (;;) {
    iteration += 1;
    await withTenantTransaction(
      database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId: options.tenantId },
      async (tx) => {
        const jobs = await claimDueJobs(tx, options.tenantId, now());
        for (const job of jobs) {
          try {
            await handler(job);
            await completeJob(tx, job.id);
          } catch (error) {
            await failJob(tx, job.id, error);
          }
        }
      },
    );

    if (iteration >= maxIterations) return;
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
