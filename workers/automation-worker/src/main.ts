import { createDatabase } from '@chai/database';
import { runInboxDispatcher } from '@chai/worker-inbox-dispatcher';

import { createFollowUpHandler } from './index';

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const tenantRoster = requiredEnv('AUTOMATION_TENANT_ROSTER');
  const pollIntervalMs = Number.parseInt(
    process.env.AUTOMATION_POLL_INTERVAL_MS ?? '1000',
    10,
  );

  const tenants = tenantRoster
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [tenantId, principalId] = entry.split(':');
      if (!tenantId || !principalId) {
        throw new Error(`Invalid AUTOMATION_TENANT_ROSTER entry: ${entry}`);
      }
      return { principalId, tenantId };
    });

  const database = createDatabase(databaseUrl);

  await runInboxDispatcher({
    database,
    handler: createFollowUpHandler(),
    options: {
      leaseMs: 30_000,
      limit: 50,
      maxAttempts: 5,
      pollIntervalMs: Number.isNaN(pollIntervalMs) ? 1000 : pollIntervalMs,
      retryBackoffMs: 5_000,
    },
    signal: shutdownSignal(),
    tenants,
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function shutdownSignal(): AbortSignal {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return controller.signal;
}

void main().catch((error) => {
  console.error('automation worker failed', error);
  process.exitCode = 1;
});
