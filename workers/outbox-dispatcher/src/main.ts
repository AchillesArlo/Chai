import { createDatabase } from '@chai/database';

import { runOutboxDispatcher, type OutboxPublisher } from './index';

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const tenantRoster = requiredEnv('OUTBOX_TENANT_ROSTER');
  const pollIntervalMs = Number.parseInt(process.env.OUTBOX_POLL_INTERVAL_MS ?? '1000', 10);

  const tenants = tenantRoster
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [tenantId, principalId] = entry.split(':');
      if (!tenantId || !principalId) {
        throw new Error(`Invalid OUTBOX_TENANT_ROSTER entry: ${entry}`);
      }
      return { principalId, tenantId };
    });

  // ponytail: real broker adapter (Redis Streams / BullMQ / NATS) is wired here
  // once the realtime-gateway slice lands. The broker is a wake-up + delivery
  // channel; the outbox table is the source of truth until ack is persisted.
  const publisher: OutboxPublisher = {
    async publish() {
      return 'acked';
    },
  };

  const database = createDatabase(databaseUrl);

  await runOutboxDispatcher({
    database,
    options: {
      leaseMs: 30_000,
      limit: 50,
      maxAttempts: 5,
      pollIntervalMs: Number.isNaN(pollIntervalMs) ? 1000 : pollIntervalMs,
      retryBackoffMs: 5_000,
    },
    publisher,
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
  console.error('outbox dispatcher failed', error);
  process.exitCode = 1;
});
