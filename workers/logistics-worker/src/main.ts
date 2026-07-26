import { createDatabase, runWithTenantRoster } from '@chai/database';
import {
  createShippingAdapterFactory,
  type ShippingAdapter,
} from '@chai/connectors/factory';

import { runLogisticsReconciler, type CarrierTrackingPort } from './reconcile';

/**
 * Logistics reconciliation worker entrypoint.
 *
 * Owns the interval loop and the graceful-shutdown wiring around one
 * reconciliation pass; the pass logic lives in `runLogisticsReconciler`. The
 * carrier is selected from the environment through the connector factory
 * (PROVIDER_LOGISTICS), so this process never hard-codes a carrier.
 */
async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const pollIntervalMs = positiveIntEnv('LOGISTICS_POLL_INTERVAL_MS', 30_000);
  const slaMs = positiveIntEnv('LOGISTICS_SLA_MS', 6 * 60 * 60_000);
  const batchLimit = positiveIntEnv('LOGISTICS_RECONCILE_BATCH', 50);
  const refreshMs = positiveIntEnv('LOGISTICS_ROSTER_REFRESH_MS', 30_000);

  const carrier = bindCarrier(createShippingAdapterFactory());
  const database = createDatabase(databaseUrl);

  console.log(
    `logistics-worker: reconciler starting pollIntervalMs=${pollIntervalMs} ` +
      `slaMs=${slaMs} batchLimit=${batchLimit}`,
  );

  try {
    await runWithTenantRoster({
      database,
      name: 'logistics-worker',
      obsoleteRosterEnv: 'LOGISTICS_TENANT_ROSTER',
      refreshMs,
      run: ({ signal, tenants }) =>
        runLogisticsReconciler({
          carrier,
          database,
          options: { batchLimit, pollIntervalMs, slaMs },
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
 * Inverts whichever shipping connector is active onto the reconciler's port.
 * Mock and live adapters expose different tracking-poll methods, so the branch
 * lives here rather than leaking connector shapes into the loop. The connector
 * has already mapped provider codes to canonical milestones; the worker still
 * canonicalises defensively so an unmapped code can never become a guess.
 */
function bindCarrier(adapter: ShippingAdapter): CarrierTrackingPort {
  return {
    async fetchTracking(tenantId, trackingNumber) {
      const record =
        'trackShipment' in adapter
          ? await adapter.trackShipment(trackingNumber, tenantId)
          : adapter.getShipment(tenantId, trackingNumber);
      if (!record) return null;
      return {
        events: record.events.map((event) => ({
          at: event.at,
          code: event.code,
          description: event.description,
          providerEventId: event.eventId,
        })),
      };
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
  console.error('logistics worker failed', error);
  process.exitCode = 1;
});