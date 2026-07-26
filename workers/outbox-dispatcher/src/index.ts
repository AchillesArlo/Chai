import type { Database, TenantContext } from '@chai/database';
import {
  claimOutboxBatch,
  markOutboxEventPublished,
  retryOutboxEvent,
  withRemoteTraceContext,
  withSpan,
  type OutboxClaim,
} from '@chai/domain';

export type { OutboxClaim };

export interface OutboxPublisher {
  publish(claim: OutboxClaim): Promise<OutboxPublishResult>;
}

export type OutboxPublishResult = 'acked' | 'failed';

export interface OutboxDispatcherOptions {
  leaseMs: number;
  limit: number;
  maxAttempts: number;
  pollIntervalMs: number;
  retryBackoffMs: number;
}

export interface OutboxDispatcherConfig {
  database: Database;
  iterations?: number;
  options: OutboxDispatcherOptions;
  publisher: OutboxPublisher;
  signal?: AbortSignal;
  tenants: TenantContext[];
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Polls the authoritative outbox, publishes each claimed event to the broker,
 * and persists the acknowledgement. The DB stays authoritative until the
 * acknowledgement is persisted, so a crash between broker ack and that persist
 * causes at-least-once redelivery — consumers must deduplicate by event id.
 */
export async function runOutboxDispatcher(
  config: OutboxDispatcherConfig,
): Promise<void> {
  const { database, options, publisher, signal, tenants } = config;
  const maxIterations = config.iterations;

  let iteration = 0;
  while (!signal?.aborted && (maxIterations === undefined || iteration < maxIterations)) {
    iteration += 1;
    let didWork = false;

    for (const tenant of tenants) {
      const claims = await database
        .begin(async (transaction) => {
          await transaction`
            SELECT set_config('app.tenant_id', ${tenant.tenantId}, true),
                   set_config('app.principal_id', ${tenant.principalId}, true)
          `;
          return claimOutboxBatch(transaction, options);
        })
        .then((value) => value);

      if (claims.length > 0) didWork = true;

      for (const claim of claims) {
        // Continue the trace that produced the event, so one trace covers
        // request -> transaction -> dispatch -> external effect.
        await withRemoteTraceContext(claim.traceparent, () =>
          withSpan(
            `outbox.dispatch ${claim.eventType}`,
            () => processOutboxClaim(database, tenant, claim, publisher, options),
            {
              'chai.aggregate.type': claim.aggregateType,
              'chai.event.type': claim.eventType,
              'chai.outbox.attempts': claim.attempts,
              'chai.outbox.event_id': claim.id,
              'chai.tenant.id': claim.tenantId,
            },
          ),
        );
      }
    }

    if (!didWork && (maxIterations === undefined || iteration < maxIterations)) {
      await sleep(options.pollIntervalMs, signal);
    }
  }
}

async function processOutboxClaim(
  database: Database,
  tenant: TenantContext,
  claim: OutboxClaim,
  publisher: OutboxPublisher,
  options: OutboxDispatcherOptions,
): Promise<void> {
  let result: OutboxPublishResult;
  try {
    result = await publisher.publish(claim);
  } catch {
    result = 'failed';
  }

  await database.begin(async (transaction) => {
    await transaction`
      SELECT set_config('app.tenant_id', ${tenant.tenantId}, true),
             set_config('app.principal_id', ${tenant.principalId}, true)
    `;
    if (result === 'acked') {
      await markOutboxEventPublished(transaction, claim.id);
    } else {
      await retryOutboxEvent(transaction, claim.id, options);
    }
  });
}
