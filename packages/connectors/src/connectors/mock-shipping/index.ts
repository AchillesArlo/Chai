import { randomUUID } from 'node:crypto';

export type ShipmentMilestone =
  | 'LINKED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'STALE'
  /**
   * Fail-safe canonical status for a provider code the platform does not
   * recognise. ADR-027 forbids guessing: an unmapped code must surface as
   * UNKNOWN and raise a mapping alert, never be assumed to mean "in transit".
   */
  | 'UNKNOWN';

export interface TrackingEvent {
  at: Date;
  code: ShipmentMilestone;
  description: string;
  eventId: string;
}

export interface ShipmentRecord {
  carrier: string;
  events: TrackingEvent[];
  lastSyncedAt: Date;
  status: ShipmentMilestone;
  tenantId: string;
  trackingNumber: string;
}

/**
 * Read-only logistics mock. Timeline is append-only; out-of-order provider
 * events are ordered by timestamp; never mutates label/pickup/cancel paths.
 */
export function createMockShippingAdapter(options?: { killSwitch?: boolean }) {
  const shipments = new Map<string, ShipmentRecord>();
  let killSwitch = options?.killSwitch ?? false;

  function key(tenantId: string, trackingNumber: string): string {
    return `${tenantId}:${trackingNumber}`;
  }

  function write(record: ShipmentRecord): ShipmentRecord {
    const events = [...record.events].sort((a, b) => a.at.getTime() - b.at.getTime());
    const last = events[events.length - 1];
    const next: ShipmentRecord = {
      ...record,
      events,
      lastSyncedAt: new Date(),
      status: last?.code ?? record.status,
    };
    shipments.set(key(record.tenantId, record.trackingNumber), next);
    return clone(next);
  }

  return {
    setKillSwitch(enabled: boolean): void {
      killSwitch = enabled;
    },

    isKillSwitchOn(): boolean {
      return killSwitch;
    },

    linkShipment(input: {
      carrier: string;
      tenantId: string;
      trackingNumber: string;
    }): ShipmentRecord {
      if (killSwitch) throw new Error('LOGISTICS_KILL_SWITCH');
      const existing = shipments.get(key(input.tenantId, input.trackingNumber));
      if (existing) return clone(existing);
      // Epoch so later carrier events always sort after the link marker.
      const linkedAt = new Date(0);
      return write({
        carrier: input.carrier,
        events: [
          {
            at: linkedAt,
            code: 'LINKED',
            description: 'Shipment linked for tracking',
            eventId: randomUUID(),
          },
        ],
        lastSyncedAt: new Date(),
        status: 'LINKED',
        tenantId: input.tenantId,
        trackingNumber: input.trackingNumber,
      });
    },

    getShipment(tenantId: string, trackingNumber: string): ShipmentRecord | null {
      const record = shipments.get(key(tenantId, trackingNumber));
      return record ? clone(record) : null;
    },

    /** Shipments owned by the tenant. Read-only projection over the store. */
    listShipments(tenantId: string): ShipmentRecord[] {
      const owned: ShipmentRecord[] = [];
      for (const record of shipments.values()) {
        if (record.tenantId === tenantId) owned.push(clone(record));
      }
      return owned;
    },

    appendEvent(
      tenantId: string,
      trackingNumber: string,
      event: Omit<TrackingEvent, 'eventId'> & { eventId?: string },
    ): ShipmentRecord | null {
      const record = shipments.get(key(tenantId, trackingNumber));
      if (!record) return null;
      // Deduplicate on the provider's event id: carriers redeliver, and an
      // append-only timeline that accepts the same scan twice reports a parcel
      // moving that never moved (acceptance LOG-03).
      if (
        event.eventId &&
        record.events.some((existing) => existing.eventId === event.eventId)
      ) {
        return clone(record);
      }
      return write({
        ...record,
        events: [
          ...record.events,
          {
            at: new Date(event.at),
            code: event.code,
            description: event.description,
            eventId: event.eventId ?? randomUUID(),
          },
        ],
      });
    },

    markStale(
      tenantId: string,
      trackingNumber: string,
      olderThanMs: number,
    ): ShipmentRecord | null {
      const record = shipments.get(key(tenantId, trackingNumber));
      if (!record) return null;
      if (Date.now() - record.lastSyncedAt.getTime() >= olderThanMs) {
        return this.appendEvent(tenantId, trackingNumber, {
          at: new Date(),
          code: 'STALE',
          description: 'No carrier update within SLA window',
        });
      }
      return clone(record);
    },

    customerView(tenantId: string, trackingNumber: string): {
      carrier: string;
      status: ShipmentMilestone;
      trackingNumber: string;
      timeline: Array<{ at: string; code: ShipmentMilestone; description: string }>;
    } | null {
      const record = this.getShipment(tenantId, trackingNumber);
      if (!record) return null;
      return {
        carrier: record.carrier,
        status: record.status,
        trackingNumber: record.trackingNumber,
        timeline: record.events.map((event) => ({
          at: event.at.toISOString(),
          code: event.code,
          description: event.description,
        })),
      };
    },
  };
}

function clone(record: ShipmentRecord): ShipmentRecord {
  return {
    ...record,
    events: record.events.map((event) => ({ ...event, at: new Date(event.at) })),
    lastSyncedAt: new Date(record.lastSyncedAt),
  };
}

export type MockShippingAdapter = ReturnType<typeof createMockShippingAdapter>;
