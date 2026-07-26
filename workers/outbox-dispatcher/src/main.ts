import { createBrokerClient, RedisStreamsOutboxPublisher } from '@chai/broker';
import { createDatabase, runWithTenantRoster } from '@chai/database';

import { runOutboxDispatcher } from './index';

/**
 * Outbox dispatcher entrypoint.
 *
 * The roster loop lives in `@chai/database` so every worker gets identical
 * semantics: live roster from the database, fail-hard on the first read, and a
 * failed refresh that keeps serving the last known roster.
 */
async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  // Fail hard when the broker is not configured. Silently falling back to a
  // no-op publisher is exactly the bug this replaces: every event would be
  // marked PUBLISHED while nothing was delivered. No REDIS_URL → no dispatcher.
  const redisUrl = requiredEnv('REDIS_URL');
  const pollIntervalMs = positiveIntEnv('OUTBOX_POLL_INTERVAL_MS', 1_000);
  const refreshMs = positiveIntEnv('OUTBOX_ROSTER_REFRESH_MS', 30_000);

  const redis = createBrokerClient(redisUrl);
  const publisher = new RedisStreamsOutboxPublisher(redis);
  const database = createDatabase(databaseUrl);

  try {
    await runWithTenantRoster({
      database,
      name: 'outbox-dispatcher',
      obsoleteRosterEnv: 'OUTBOX_TENANT_ROSTER',
      refreshMs,
      run: ({ signal, tenants }) =>
        runOutboxDispatcher({
          database,
          options: {
            leaseMs: 30_000,
            limit: 50,
            maxAttempts: 5,
            pollIntervalMs,
            retryBackoffMs: 5_000,
          },
          publisher,
          signal,
          tenants,
        }),
      signal: shutdownSignal(),
    });
  } finally {
    await redis.quit().catch(() => redis.disconnect());
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

void main().catch((error) => {
  console.error('outbox dispatcher failed', error);
  process.exitCode = 1;
});
