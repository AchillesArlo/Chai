import { createDatabase, runWithTenantRoster } from '@chai/database';

import { runAutomationWorker } from './runner';
import type { FollowUpJob } from './types';

/**
 * Automation worker entrypoint.
 *
 * Runs the REAL follow-up job loop (`runAutomationWorker`) per tenant against the
 * live roster, replacing the inbox no-op that used to leave `chai.follow_up_job`
 * rows PENDING forever. The roster loop lives in `@chai/database` so every worker
 * gets identical semantics: live roster from the database, fail-hard on the first
 * read, and a failed refresh that keeps serving the last known roster.
 */

/**
 * Deployed follow-up handler.
 *
 * The follow-up SEND action — re-check state / consent / messaging window /
 * expected version, then enqueue the outbox message — is not implemented yet
 * (S2-4). This handler therefore FAILS each claimed job with a clear reason
 * instead of completing it: `runAutomationWorker` records the reason in
 * `follow_up_job.last_error` and the job lands in FAILED, where it is visible for
 * reconciliation. Marking un-sent work DONE would be the "acked but dropped" bug
 * this worker is fixing, so a real effect is never fabricated here.
 */
export const executeFollowUp = async (job: FollowUpJob): Promise<void> => {
  throw new Error(
    `follow-up execution not implemented (S2-4): refusing to mark job ${job.id} ` +
      'DONE without re-checking consent/window/version and enqueuing the send',
  );
};

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const pollIntervalMs = positiveIntEnv('AUTOMATION_POLL_INTERVAL_MS', 1_000);
  const refreshMs = positiveIntEnv('AUTOMATION_ROSTER_REFRESH_MS', 30_000);

  const database = createDatabase(databaseUrl);

  try {
    await runWithTenantRoster({
      database,
      name: 'automation-worker',
      obsoleteRosterEnv: 'AUTOMATION_TENANT_ROSTER',
      refreshMs,
      // `runAutomationWorker` owns one tenant's job loop; the roster fans it over
      // every ACTIVE tenant and the window signal ends each pass on shutdown or a
      // roster refresh.
      // ponytail: one polling loop per tenant shares the connection pool (max 10);
      // a very large roster would want a single interleaved loop instead.
      run: ({ signal, tenants }) =>
        Promise.all(
          tenants.map((tenant) =>
            runAutomationWorker(database, {
              handler: executeFollowUp,
              intervalMs: pollIntervalMs,
              signal,
              tenantId: tenant.tenantId,
            }),
          ),
        ).then(() => undefined),
      signal: shutdownSignal(),
    });
  } finally {
    await database.end();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return parsed;
}

function shutdownSignal(): AbortSignal {
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return controller.signal;
}

// ponytail: skip main when vitest (or any importer) loads this module.
if (process.env.VITEST === undefined) {
  void main().catch((error) => {
    console.error('automation worker failed', error);
    process.exitCode = 1;
  });
}
