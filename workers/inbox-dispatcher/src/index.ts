import type { Database, TenantContext } from '@chai/database';
import {
  acknowledgeInboxEvent,
  claimInboxBatch,
  retryInboxEvent,
  type InboxClaim,
} from '@chai/domain';

export type { InboxClaim };

export interface InboxHandler {
  process(claim: InboxClaim): Promise<InboxHandlerResult>;
}

export type InboxHandlerResult = 'processed' | 'retry';

export interface InboxDispatcherOptions {
  leaseMs: number;
  limit: number;
  maxAttempts: number;
  pollIntervalMs: number;
  retryBackoffMs: number;
}

export interface InboxDispatcherConfig {
  database: Database;
  handler: InboxHandler;
  iterations?: number;
  options: InboxDispatcherOptions;
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
 * Polls the authoritative inbox for the configured tenants, hands each claimed
 * event to the handler, and acknowledges or retries it. The database lease
 * acquired at claim time is what makes delivery at-least-once and safe across
 * worker restarts; the handler must be idempotent.
 */
export async function runInboxDispatcher(
  config: InboxDispatcherConfig,
): Promise<void> {
  const { database, handler, options, signal, tenants } = config;
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
          return claimInboxBatch(transaction, options);
        })
        .then((value) => value);

      if (claims.length > 0) didWork = true;

      for (const claim of claims) {
        await processInboxClaim(database, tenant, claim, handler, options);
      }
    }

    if (!didWork && (maxIterations === undefined || iteration < maxIterations)) {
      await sleep(options.pollIntervalMs, signal);
    }
  }
}

async function processInboxClaim(
  database: Database,
  tenant: TenantContext,
  claim: InboxClaim,
  handler: InboxHandler,
  options: InboxDispatcherOptions,
): Promise<void> {
  let result: InboxHandlerResult;
  try {
    result = await handler.process(claim);
  } catch {
    result = 'retry';
  }

  await database.begin(async (transaction) => {
    await transaction`
      SELECT set_config('app.tenant_id', ${tenant.tenantId}, true),
             set_config('app.principal_id', ${tenant.principalId}, true)
    `;
    if (result === 'processed') {
      await acknowledgeInboxEvent(transaction, claim.id);
    } else {
      await retryInboxEvent(transaction, claim.id, options);
    }
  });
}
