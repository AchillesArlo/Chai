import { createDatabase } from '@chai/database';
import { afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  runLogisticsReconciler,
  type CarrierEvent,
  type CarrierTrackingPort,
} from '../src';

import {
  fetchOutboxEvents,
  fetchShipment,
  LOGISTICS_IDS,
  resetLogisticsTables,
  seedFoundation,
  seedShipment,
  type StoredEvent,
} from './helpers';

/** A carrier that returns canned scans keyed by tracking number. */
function carrierReturning(
  byTracking: Record<string, CarrierEvent[]>,
): CarrierTrackingPort {
  return {
    async fetchTracking(_tenantId, trackingNumber) {
      return { events: byTracking[trackingNumber] ?? [] };
    },
  };
}

const tenantContext = {
  principalId: LOGISTICS_IDS.workerUser,
  tenantId: LOGISTICS_IDS.tenantA,
};

const SIX_HOURS_MS = 6 * 60 * 60_000;
const TEN_HOURS_AGO = new Date(Date.now() - 10 * 60 * 60_000);
const options = { batchLimit: 50, pollIntervalMs: 0, slaMs: SIX_HOURS_MS };

function priorEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    at: '2026-07-25T00:00:00.000Z',
    code: 'IN_TRANSIT',
    description: 'Departed hub',
    eventId: 'seed-init',
    ...overrides,
  };
}

describe('logistics reconciler — SLA-gated carrier poll under RLS', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetLogisticsTables(adminDatabaseUrl);
  });

  it('processes a shipment past the SLA window and skips one that is not', async () => {
    await seedShipment(adminDatabaseUrl, {
      events: [priorEvent({ eventId: 'stale-init' })],
      id: LOGISTICS_IDS.shipmentStale,
      lastSyncedAt: TEN_HOURS_AGO,
      trackingNumber: 'TRK-STALE',
    });
    await seedShipment(adminDatabaseUrl, {
      events: [priorEvent({ eventId: 'fresh-init' })],
      id: LOGISTICS_IDS.shipmentFresh,
      lastSyncedAt: new Date(),
      trackingNumber: 'TRK-FRESH',
    });

    const carrier = carrierReturning({
      'TRK-FRESH': [
        {
          at: new Date('2026-07-26T00:00:00.000Z'),
          code: 'OUT_FOR_DELIVERY',
          description: 'Out for delivery',
          providerEventId: 'fresh-scan',
        },
      ],
      'TRK-STALE': [
        {
          at: new Date('2026-07-26T00:00:00.000Z'),
          code: 'OUT_FOR_DELIVERY',
          description: 'Out for delivery',
          providerEventId: 'stale-scan',
        },
      ],
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runLogisticsReconciler({
        carrier,
        database: worker,
        iterations: 1,
        options,
        tenants: [tenantContext],
      });
    } finally {
      await worker.end();
    }

    // Stale shipment advanced to the new scan.
    const stale = await fetchShipment(adminDatabaseUrl, 'TRK-STALE');
    expect(stale?.status).toBe('OUT_FOR_DELIVERY');
    expect(stale?.events.some((event) => event.eventId === 'stale-scan')).toBe(true);

    // Fresh shipment was inside the SLA window, so it was never polled.
    const fresh = await fetchShipment(adminDatabaseUrl, 'TRK-FRESH');
    expect(fresh?.status).toBe('IN_TRANSIT');
    expect(fresh?.events.some((event) => event.eventId === 'fresh-scan')).toBe(false);

    // Exactly one shipment produced a business event.
    const events = await fetchOutboxEvents(adminDatabaseUrl);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('shipment.tracking_updated');
    expect(events[0]?.aggregateType).toBe('shipment');
  });

  it('deduplicates a redelivered scan on providerEventId', async () => {
    await seedShipment(adminDatabaseUrl, {
      events: [priorEvent({ eventId: 'evt-dup' })],
      id: LOGISTICS_IDS.shipmentDedup,
      lastSyncedAt: TEN_HOURS_AGO,
      trackingNumber: 'TRK-DEDUP',
    });

    const carrier = carrierReturning({
      'TRK-DEDUP': [
        {
          // Same provider id as the seeded scan — must not be appended again.
          at: new Date('2026-07-25T00:00:00.000Z'),
          code: 'IN_TRANSIT',
          description: 'Departed hub (redelivered)',
          providerEventId: 'evt-dup',
        },
        {
          at: new Date('2026-07-26T00:00:00.000Z'),
          code: 'OUT_FOR_DELIVERY',
          description: 'Out for delivery',
          providerEventId: 'evt-new',
        },
      ],
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runLogisticsReconciler({
        carrier,
        database: worker,
        iterations: 1,
        options,
        tenants: [tenantContext],
      });
    } finally {
      await worker.end();
    }

    const shipment = await fetchShipment(adminDatabaseUrl, 'TRK-DEDUP');
    const duplicates = shipment?.events.filter((event) => event.eventId === 'evt-dup');
    expect(duplicates).toHaveLength(1);
    expect(shipment?.events.some((event) => event.eventId === 'evt-new')).toBe(true);
    expect(shipment?.status).toBe('OUT_FOR_DELIVERY');

    // Only the genuinely new scan is carried in the event payload.
    const events = await fetchOutboxEvents(adminDatabaseUrl);
    expect(events).toHaveLength(1);
    const payloadEvents = events[0]?.payload.events as Array<{ eventId: string }>;
    expect(payloadEvents.map((event) => event.eventId)).toEqual(['evt-new']);
  });

  it('surfaces an unrecognised carrier code as UNKNOWN rather than guessing', async () => {
    await seedShipment(adminDatabaseUrl, {
      events: [],
      id: LOGISTICS_IDS.shipmentUnknown,
      lastSyncedAt: TEN_HOURS_AGO,
      trackingNumber: 'TRK-UNKNOWN',
    });

    const carrier = carrierReturning({
      'TRK-UNKNOWN': [
        {
          at: new Date('2026-07-26T00:00:00.000Z'),
          code: 'SOME_UNMAPPED_CARRIER_CODE',
          description: 'Held at customs (new code)',
          providerEventId: 'unknown-scan',
        },
      ],
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runLogisticsReconciler({
        carrier,
        database: worker,
        iterations: 1,
        options,
        tenants: [tenantContext],
      });
    } finally {
      await worker.end();
    }

    const shipment = await fetchShipment(adminDatabaseUrl, 'TRK-UNKNOWN');
    const appended = shipment?.events.find((event) => event.eventId === 'unknown-scan');
    expect(appended?.code).toBe('UNKNOWN');
    expect(appended?.code).not.toBe('IN_TRANSIT');
    expect(shipment?.status).toBe('UNKNOWN');
  });
});
