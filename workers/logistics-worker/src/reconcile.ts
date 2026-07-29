import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
  type TenantContext,
} from '@chai/database';
import { commitBusinessMutation } from '@chai/domain';
import type { ShipmentMilestone } from '@chai/connectors/mock-shipping';

/**
 * Logistics reconciliation worker.
 *
 * Carrier webhooks are best-effort, so a shipment can silently stop updating.
 * This worker is the polling fallback the blueprint requires (ADR-027, LOG-02):
 * it finds shipments whose last sync exceeds the SLA window, pulls the carrier's
 * tracking, and appends any genuinely new scans — deduplicated on the provider's
 * own event id so a redelivery cannot report a parcel moving twice, and with any
 * code the platform does not recognise surfaced as UNKNOWN rather than guessed
 * into a moving status.
 */

/**
 * Polling fallback for carrier tracking. Marks STALE when last sync exceeds SLA.
 */
export function shouldMarkStale(lastSyncedAt: Date, now: Date, slaMs: number): boolean {
  return now.getTime() - lastSyncedAt.getTime() >= slaMs;
}

const SHIPMENT_MILESTONES = new Set<string>([
  'LINKED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'STALE',
  'UNKNOWN',
]);

/**
 * Maps a carrier code onto the canonical milestone set, failing SAFE.
 *
 * A code the platform does not recognise becomes UNKNOWN — never IN_TRANSIT.
 * The provider→canonical mapping is the connector's job; this is the worker's
 * last line of defence so an unmapped code can never be guessed into "probably
 * moving" (ADR-027, acceptance LOG-02).
 */
export function canonicalMilestone(code: string): ShipmentMilestone {
  return SHIPMENT_MILESTONES.has(code) ? (code as ShipmentMilestone) : 'UNKNOWN';
}

/** One carrier tracking scan as returned by the port. */
export interface CarrierEvent {
  at: Date;
  /** Raw carrier code. Canonicalised by the worker; unknown → UNKNOWN. */
  code: string;
  description: string;
  /** Carrier's own event id, used to deduplicate redeliveries. */
  providerEventId: string;
}

/**
 * The carrier poll, inverted so the loop never depends on a concrete connector
 * and can be exercised against a real database with a fake carrier in tests.
 */
export interface CarrierTrackingPort {
  fetchTracking(
    tenantId: string,
    trackingNumber: string,
  ): Promise<{ events: CarrierEvent[] } | null>;
}

export interface LogisticsReconcilerOptions {
  /** Max shipments considered per tenant per pass. */
  batchLimit: number;
  /** Idle sleep between passes when nothing changed. */
  pollIntervalMs: number;
  /** How long since the last sync before a shipment is polled. */
  slaMs: number;
}

type TenantRunner = <T>(
  database: Database,
  context: TenantContext,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
) => Promise<T>;

export interface LogisticsReconcilerConfig {
  carrier: CarrierTrackingPort;
  database: Database;
  /** Bounded pass count for tests; unbounded in production. */
  iterations?: number;
  /** Overridable clock for tests. */
  now?: () => Date;
  options: LogisticsReconcilerOptions;
  /** Overridable for tests; defaults to the RLS-scoped tenant transaction. */
  runInTenant?: TenantRunner;
  signal?: AbortSignal;
  tenants: readonly TenantContext[];
}

interface StoredEvent {
  at: string;
  code: ShipmentMilestone;
  description: string;
  eventId: string;
}

interface TrackableRow {
  last_synced_at: Date;
  tracking_number: string;
}

interface LockedShipmentRow {
  events: StoredEvent[] | string;
  id: string;
  status: ShipmentMilestone;
  tracking_number: string;
}

function parseEvents(raw: StoredEvent[] | string | undefined): StoredEvent[] {
  if (!raw) return [];
  return typeof raw === 'string' ? (JSON.parse(raw) as StoredEvent[]) : raw;
}

async function selectTrackableShipments(
  transaction: DatabaseTransaction,
  tenantId: string,
  limit: number,
): Promise<TrackableRow[]> {
  // Delivered shipments are terminal and excluded; the oldest sync is polled
  // first so a backlog drains fairly.
  return transaction<TrackableRow[]>`
    SELECT tracking_number, last_synced_at
    FROM chai.shipment
    WHERE tenant_id = ${tenantId}
      AND status <> 'DELIVERED'
    ORDER BY last_synced_at ASC
    LIMIT ${Math.max(1, Math.trunc(limit))}::int
  `;
}

/**
 * Appends fresh scans (already deduplicated and canonicalised) to a shipment
 * and commits the events, the audit entry, and the outbox event together
 * (ADR-007). The timeline is ordered by PROVIDER time so an out-of-order
 * redelivery cannot roll the status backwards.
 */
async function appendAndCommit(
  transaction: DatabaseTransaction,
  tenant: TenantContext,
  row: LockedShipmentRow,
  prior: StoredEvent[],
  fresh: StoredEvent[],
  eventType: string,
): Promise<boolean> {
  const merged = [...prior, ...fresh].sort(
    (left, right) => new Date(left.at).getTime() - new Date(right.at).getTime(),
  );
  const status: ShipmentMilestone = merged[merged.length - 1]?.code ?? row.status;

  await commitBusinessMutation(transaction, {
    describe: (result) => ({
      audit: {
        action: 'shipment.reconcile',
        actorId: tenant.principalId,
        metadata: {
          appended: fresh.length,
          status: result.status,
          trackingNumber: result.tracking_number,
        },
        reason: eventType,
        resourceId: result.id,
        resourceType: 'shipment',
      },
      events: [
        {
          aggregateId: result.id,
          aggregateType: 'shipment',
          aggregateVersion: merged.length,
          eventType,
          partitionKey: result.tracking_number,
          payload: {
            events: fresh.map((event) => ({
              at: event.at,
              code: event.code,
              description: event.description,
              eventId: event.eventId,
            })),
            status: result.status,
            trackingNumber: result.tracking_number,
          },
        },
      ],
    }),
    mutate: async () => {
      const updated = await transaction<LockedShipmentRow[]>`
        UPDATE chai.shipment
        SET events = ${transaction.json(merged as unknown as Parameters<typeof transaction.json>[0])}::jsonb,
            status = ${status},
            last_synced_at = now(),
            updated_at = now()
        WHERE id = ${row.id}
        RETURNING id, tracking_number, status, events
      `;
      return updated[0] as LockedShipmentRow;
    },
    tenantId: tenant.tenantId,
  });
  return true;
}

/**
 * Reconciles one shipment inside a single tenant-scoped transaction: the row is
 * re-read `FOR UPDATE`, incoming scans are deduplicated on the provider event id
 * and canonicalised, and either the new scans or — when the carrier had nothing
 * within the SLA window — a single STALE marker is committed.
 *
 * ponytail: the dedup + provider-time ordering here mirrors the webhook path in
 * `apps/api/src/modules/logistics` (acceptance LOG-03). It is intentionally not
 * shared: the worker's file scope excludes that module, and a shared home would
 * belong under a `packages/domain/src/logistics` this task was not scoped to add.
 * Upgrade path: extract both into `@chai/domain` when a change is allowed to
 * touch the api logistics module, exactly as the payment transition machine was.
 */
async function reconcileShipment(
  transaction: DatabaseTransaction,
  tenant: TenantContext,
  trackingNumber: string,
  incoming: readonly CarrierEvent[],
  now: Date,
): Promise<boolean> {
  const rows = await transaction<LockedShipmentRow[]>`
    SELECT id, tracking_number, status, events
    FROM chai.shipment
    WHERE tenant_id = ${tenant.tenantId} AND tracking_number = ${trackingNumber}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) return false;

  const prior = parseEvents(row.events);
  const priorIds = new Set(prior.map((event) => event.eventId));
  const fresh: StoredEvent[] = incoming
    .filter((event) => event.providerEventId && !priorIds.has(event.providerEventId))
    .map((event) => ({
      at: new Date(event.at).toISOString(),
      code: canonicalMilestone(event.code),
      description: event.description,
      eventId: event.providerEventId,
    }));

  if (fresh.length > 0) {
    return appendAndCommit(transaction, tenant, row, prior, fresh, 'shipment.tracking_updated');
  }

  // No fresh scan within the SLA window. Surface STALE once so a parcel that may
  // be lost stops looking healthy; if already STALE, only advance the sync
  // cursor (operational metadata, not a business change, so no event).
  if (row.status === 'STALE') {
    await transaction`UPDATE chai.shipment SET last_synced_at = now() WHERE id = ${row.id}`;
    return false;
  }
  const stale: StoredEvent = {
    at: now.toISOString(),
    code: 'STALE',
    description: 'No carrier update within SLA window',
    eventId: randomUUID(),
  };
  return appendAndCommit(transaction, tenant, row, prior, [stale], 'shipment.stale');
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
 * Polls the carrier for every stale, non-terminal shipment per tenant and
 * appends new scans. The SLA gate (`shouldMarkStale`) decides which shipments
 * are polled; the carrier call happens outside the transaction so no row lock is
 * held across a network round-trip.
 */
export async function runLogisticsReconciler(
  config: LogisticsReconcilerConfig,
): Promise<void> {
  const { carrier, database, options, signal, tenants } = config;
  const runInTenant = config.runInTenant ?? withTenantTransaction;
  const now = config.now ?? ((): Date => new Date());
  const maxIterations = config.iterations;

  let iteration = 0;
  while (
    !signal?.aborted &&
    (maxIterations === undefined || iteration < maxIterations)
  ) {
    iteration += 1;
    let didWork = false;

    for (const tenant of tenants) {
      if (signal?.aborted) break;
      const candidates = await runInTenant(database, tenant, (transaction) =>
        selectTrackableShipments(transaction, tenant.tenantId, options.batchLimit),
      );
      const passNow = now();

      for (const candidate of candidates) {
        if (signal?.aborted) break;
        // SLA gate: only shipments whose last sync exceeds the window are polled.
        if (!shouldMarkStale(candidate.last_synced_at, passNow, options.slaMs)) {
          continue;
        }
        const tracking = await carrier.fetchTracking(
          tenant.tenantId,
          candidate.tracking_number,
        );
        const applied = await runInTenant(database, tenant, (transaction) =>
          reconcileShipment(
            transaction,
            tenant,
            candidate.tracking_number,
            tracking?.events ?? [],
            now(),
          ),
        );
        if (applied) didWork = true;
      }
    }

    if (!didWork && (maxIterations === undefined || iteration < maxIterations)) {
      await sleep(options.pollIntervalMs, signal);
    }
  }
}
