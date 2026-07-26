import { createDatabase } from '@chai/database';

import { runInboxDispatcher, type InboxHandler } from './index';

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const tenantRoster = requiredEnv('INBOX_TENANT_ROSTER');
  const pollIntervalMs = Number.parseInt(process.env.INBOX_POLL_INTERVAL_MS ?? '1000', 10);

  // ponytail: tenant roster is supplied by the operator (tenantId:principalId
  // pairs, comma-separated). Cross-tenant scanning and the Redis wake-up fan-in
  // are the deferred upgrade path; the DB stays authoritative either way.
  const tenants = tenantRoster
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [tenantId, principalId] = entry.split(':');
      if (!tenantId || !principalId) {
        throw new Error(`Invalid INBOX_TENANT_ROSTER entry: ${entry}`);
      }
      return { principalId, tenantId };
    });

  const handler: InboxHandler = {
    async process() {
      // ponytail: delegate to the domain worker (channel/conversation slice,
      // Task 9). Until then this no-op keeps the dispatcher verifiable in isolation.
      return 'processed';
    },
  };

  const database = createDatabase(databaseUrl);

  await runInboxDispatcher({
    database,
    handler,
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
  console.error('inbox dispatcher failed', error);
  process.exitCode = 1;
});
