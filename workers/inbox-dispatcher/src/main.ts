import { createBrokerClient } from '@chai/broker';
import { createDatabase, runWithTenantRoster } from '@chai/database';

import {
  runInboxDispatcher,
  type InboxClaim,
  type InboxHandler,
  type InboxHandlerResult,
} from './index';
import { runMessageReceivedConsumer } from './message-received-consumer';
import { runAiReplyConsumer } from './ai-reply-consumer';

/**
 * Honest inbox handler for the standalone dispatcher.
 *
 * The domain effect for an inbox event is applied SYNCHRONOUSLY at the API edge
 * (`ChannelsController.ingestWebhook` -> `repository.ingest` records the row,
 * runs `ingestInboundEvent`, and marks it PROCESSED in one transaction), so a
 * committed row is PROCESSED and never reaches this loop — `claimInboxBatch`
 * only claims PENDING/RETRY. There is also no payload store to rebuild the raw
 * event from: `chai.inbox_event` keeps only a `payload_reference` + hash.
 *
 * So a claim reaching here was NOT processed inline and cannot be processed by
 * this worker. Acking it 'processed' would silently drop it — the exact bug this
 * fixes. It returns 'retry' to surface a stray event through the dispatcher's
 * retry -> DEAD_LETTER path. Real async processing is BLOCKED on a restricted
 * payload store (packages/domain + apps/api), out of this worker's file scope.
 */
export function createInboxHandler(): InboxHandler {
  return {
    async process(claim: InboxClaim): Promise<InboxHandlerResult> {
      console.warn(
        'inbox-dispatcher: refusing to ack unprocessed inbox event; domain ' +
          'ingest runs inline at the API edge and this worker has no payload ' +
          'store to re-run it',
        { id: claim.id, provider: claim.provider, tenantId: claim.tenantId },
      );
      return 'retry';
    },
  };
}

/**
 * Inbox dispatcher entrypoint.
 *
 * The roster loop lives in `@chai/database` so every worker gets identical
 * semantics: live roster from the database, fail-hard on the first read, and a
 * failed refresh that keeps serving the last known roster.
 */
async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const pollIntervalMs = positiveIntEnv('INBOX_POLL_INTERVAL_MS', 1_000);
  const refreshMs = positiveIntEnv('INBOX_ROSTER_REFRESH_MS', 30_000);

  const handler = createInboxHandler();

  const database = createDatabase(databaseUrl);
  const signal = shutdownSignal();

  // The Redis consumer is the production user of RedisStreamsConsumer (FASE 30):
  // it drains `message.received` and materializes chai.message_fact. It runs
  // concurrently with the authoritative DB inbox loop and shares the shutdown
  // signal. Absent REDIS_URL the worker still runs the DB loop, so the broker
  // stays an optional accelerator rather than a hard dependency.
  const redisUrl = process.env.REDIS_URL;

  try {
    const rosterLoop = runWithTenantRoster({
      database,
      name: 'inbox-dispatcher',
      obsoleteRosterEnv: 'INBOX_TENANT_ROSTER',
      refreshMs,
      run: ({ signal: runSignal, tenants }) =>
        runInboxDispatcher({
          database,
          handler,
          options: {
            leaseMs: 30_000,
            limit: 50,
            maxAttempts: 5,
            pollIntervalMs,
            retryBackoffMs: 5_000,
          },
          signal: runSignal,
          tenants,
        }),
      signal,
    });

    if (redisUrl === undefined || redisUrl === '') {
      console.warn(
        'inbox-dispatcher: REDIS_URL not set; message.received fact consumer disabled',
      );
      await rosterLoop;
      return;
    }

    const redis = createBrokerClient(redisUrl);
    const messageFactConsumerLoop = runMessageReceivedConsumer({ database, redis, signal });
    const aiReplyConsumerLoop = runAiReplyConsumer({ database, redis, signal });
    const consumerLoops = Promise.all([messageFactConsumerLoop, aiReplyConsumerLoop]).finally(
      () => redis.quit().catch(() => redis.disconnect()),
    );
    await Promise.all([rosterLoop, consumerLoops]);
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
    console.error('inbox dispatcher failed', error);
    process.exitCode = 1;
  });
}
