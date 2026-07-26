import { setTimeout as delay } from 'node:timers/promises';

import { createDatabase, runWithTenantRoster } from '@chai/database';
import type { SloObjective } from '@chai/domain';

import { runBurnRateHarvest } from './burn-rate-harvester';

/**
 * Analytics worker entrypoint.
 *
 * `runBurnRateHarvest` does exactly one pass over the tenant roster: it samples
 * the outbox-delivery SLI per tenant under that tenant's RLS context, evaluates
 * the multi-window burn-rate policy, and forwards firing alerts through the
 * outbox — all in the same transaction as the read. This process owns the
 * interval loop and the graceful-shutdown wiring around that pass; it does not
 * reimplement any of the harvest logic.
 *
 * The roster comes from chai.active_tenant_roster() and is re-read every cycle,
 * so a newly-activated tenant is sampled without a redeploy. The harvest
 * interval doubles as the (configurable) roster-refresh cadence.
 */
async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const intervalMs = positiveIntEnv('ANALYTICS_BURN_RATE_INTERVAL_MS', 60_000);

  // Defaults describe the outbox-delivery SLO the harvester samples; each is
  // overridable so an operator can retune without a redeploy. The domain
  // validates the objective (must be in (0,1)), so a bad value fails the pass
  // loudly rather than silently mis-scoring the burn rate.
  const objective: SloObjective = {
    objective: floatEnv('ANALYTICS_SLO_OBJECTIVE', 0.999),
    periodDays: positiveIntEnv('ANALYTICS_SLO_PERIOD_DAYS', 30),
    sloId: process.env.ANALYTICS_SLO_ID ?? 'outbox-delivery',
  };

  const database = createDatabase(databaseUrl);

  console.log(
    `analytics-worker: burn-rate harvester starting intervalMs=${intervalMs} ` +
      `sloId=${objective.sloId}`,
  );

  try {
    await runWithTenantRoster({
      database,
      name: 'analytics-worker',
      obsoleteRosterEnv: 'ANALYTICS_TENANT_ROSTER',
      // One harvest per window: the roster refresh cadence and the harvest
      // interval are the same knob, since a pass is cheap and idempotent.
      refreshMs: intervalMs,
      run: async ({ signal, tenants }) => {
        const reports = await runBurnRateHarvest({ database, objective, tenants });
        for (const report of reports) {
          console.log(
            `analytics-worker: tenant=${report.tenantId} ` +
              `firing=${report.firing.length} notEvaluated=${report.notEvaluated.length}`,
          );
        }
        // Wait out the rest of the window; the window signal ends the wait on
        // shutdown or when it is time to refresh the roster.
        await delay(intervalMs, undefined, { signal }).catch(() => undefined);
      },
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
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return parsed;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a number, got: ${raw}`);
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

void main().catch((error) => {
  console.error('analytics worker failed', error);
  process.exitCode = 1;
});
