import { createDatabase, runWithTenantRoster } from '@chai/database';
import {
  createPaymentAdapterFactory,
  type PaymentAdapter,
} from '@chai/connectors/factory';

import { runPaymentReconciler, type PaymentProviderPort } from './reconcile';

/**
 * Payment reconciliation worker entrypoint.
 *
 * Owns the interval loop and the graceful-shutdown wiring around one
 * reconciliation pass; the pass logic lives in `runPaymentReconciler`. The
 * provider is selected from the environment through the connector factory
 * (PROVIDER_PAYMENT), so this process never hard-codes a PSP.
 */
async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const pollIntervalMs = positiveIntEnv('PAYMENT_POLL_INTERVAL_MS', 15_000);
  const batchLimit = positiveIntEnv('PAYMENT_RECONCILE_BATCH', 50);
  const refreshMs = positiveIntEnv('PAYMENT_ROSTER_REFRESH_MS', 30_000);

  const provider = bindProvider(createPaymentAdapterFactory());
  const database = createDatabase(databaseUrl);

  console.log(
    `payment-worker: reconciler starting pollIntervalMs=${pollIntervalMs} ` +
      `batchLimit=${batchLimit}`,
  );

  try {
    await runWithTenantRoster({
      database,
      name: 'payment-worker',
      obsoleteRosterEnv: 'PAYMENT_TENANT_ROSTER',
      refreshMs,
      run: ({ signal, tenants }) =>
        runPaymentReconciler({
          database,
          options: { batchLimit, pollIntervalMs },
          provider,
          signal,
          tenants,
        }),
      signal: shutdownSignal(),
    });
  } finally {
    await database.end();
  }
}

/**
 * Inverts whichever payment connector is active onto the reconciler's port.
 * Mock and live adapters expose different status-poll methods, so the branch
 * lives here rather than leaking connector shapes into the loop.
 */
function bindProvider(adapter: PaymentAdapter): PaymentProviderPort {
  return {
    async fetchStatus(tenantId, externalId) {
      const session =
        'getSessionStatus' in adapter
          ? await adapter.getSessionStatus(tenantId, externalId)
          : await adapter.getSession(tenantId, externalId);
      return session ? { status: session.status } : null;
    },
  };
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

function shutdownSignal(): AbortSignal {
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return controller.signal;
}

void main().catch((error) => {
  console.error('payment worker failed', error);
  process.exitCode = 1;
});
