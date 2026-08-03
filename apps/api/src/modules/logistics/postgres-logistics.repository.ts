import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';
import type {
  ShipmentMilestone,
  ShipmentRecord,
  TrackingEvent,
} from '@chai/connectors/mock-shipping';

import { commitBusinessMutation } from '@chai/domain';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import { LogisticsRepository } from './logistics.repository';

interface ShipmentRow {
  id: string;
  tenant_id: string;
  carrier: string;
  tracking_number: string;
  status: ShipmentMilestone;
  events: StoredEvent[] | string;
  last_synced_at: Date;
  contact_id: string | null;
  order_reference: string | null;
  order_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface StoredEvent {
  at: string;
  code: ShipmentMilestone;
  description: string;
  eventId: string;
}

@Injectable()
export class PostgresLogisticsRepository extends LogisticsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  // ponytail: kill switch is an in-process circuit breaker, not durable state.
  private killSwitch = false;

  override async link(
    tenantId: string,
    input: {
      carrier: string;
      contactId?: string;
      orderId?: string;
      orderReference?: string;
      trackingNumber: string;
    },
  ): Promise<ShipmentRecord> {
    if (this.killSwitch) throw new Error('LOGISTICS_KILL_SWITCH');
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const existing: ShipmentRow[] = await tx`
          SELECT * FROM chai.shipment
          WHERE tenant_id = ${tenantId}
            AND tracking_number = ${input.trackingNumber}
        `;
        if (existing.length > 0) {
          return this.mapRecord(existing[0] as ShipmentRow);
        }
        const id = randomUUID();
        const linkedAt = new Date(0);
        const events: StoredEvent[] = [
          {
            at: linkedAt.toISOString(),
            code: 'LINKED',
            description: 'Shipment linked',
            eventId: randomUUID(),
          },
        ];
        return commitBusinessMutation(tx, {
          tenantId,
          mutate: async () => {
            await tx`
              INSERT INTO chai.shipment
                (id, tenant_id, carrier, tracking_number, status, events,
                 last_synced_at, contact_id, order_reference, order_id)
              VALUES
                (${id}, ${tenantId}, ${input.carrier}, ${input.trackingNumber}, 'LINKED',
                 ${tx.json(events as unknown as Parameters<typeof tx.json>[0])}::jsonb, ${linkedAt},
                 ${input.contactId ?? null}, ${input.orderReference ?? null}, ${input.orderId ?? null})
            `;
            return {
              carrier: input.carrier,
              events: [
                {
                  at: linkedAt,
                  code: 'LINKED' as const,
                  description: 'Shipment linked',
                  eventId: events[0]?.eventId as string,
                },
              ],
              lastSyncedAt: linkedAt,
              status: 'LINKED' as const,
              tenantId,
              trackingNumber: input.trackingNumber,
            };
          },
          describe: (record) => ({
            audit: {
              action: 'shipment.linked',
              actorId: SERVICE_PRINCIPAL_ID,
              metadata: { carrier: input.carrier, trackingNumber: input.trackingNumber },
              resourceId: id,
              resourceType: 'shipment',
            },
            events: [
              {
                aggregateId: id,
                aggregateType: 'shipment',
                aggregateVersion: 1,
                eventType: 'shipment.created',
                partitionKey: input.trackingNumber,
                payload: { carrier: input.carrier, status: record.status, trackingNumber: input.trackingNumber },
              },
            ],
          }),
        });
      },
    );
  }

  override async get(
    tenantId: string,
    trackingNumber: string,
  ): Promise<ShipmentRecord | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows: ShipmentRow[] = await tx`
          SELECT * FROM chai.shipment
          WHERE tenant_id = ${tenantId}
            AND tracking_number = ${trackingNumber}
        `;
        if (rows.length === 0) return null;
        return this.mapRecord(rows[0] as ShipmentRow);
      },
    );
  }

  override async listShipments(tenantId: string): Promise<ShipmentRecord[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows: ShipmentRow[] = await tx`
          SELECT * FROM chai.shipment
          WHERE tenant_id = ${tenantId}
          ORDER BY created_at DESC
          LIMIT 100
        `;
        return rows.map((row) => this.mapRecord(row as ShipmentRow));
      },
    );
  }

  override async customerView(
    tenantId: string,
    trackingNumber: string,
  ): Promise<{
    carrier: string;
    status: ShipmentMilestone;
    trackingNumber: string;
    timeline: Array<{ at: string; code: ShipmentMilestone; description: string }>;
  } | null> {
    const record = await this.get(tenantId, trackingNumber);
    if (!record) return null;
    return this.toCustomerView(record);
  }

  /** Customer-safe projection: canonical status and timeline only. */
  private toCustomerView(record: ShipmentRecord) {
    return {
      carrier: record.carrier,
      status: record.status,
      trackingNumber: record.trackingNumber,
      timeline: record.events
        .slice()
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map((event) => ({
          at: event.at.toISOString(),
          code: event.code,
          description: event.description,
        })),
    };
  }

  override async customerLookup(
    tenantId: string,
    trackingNumber: string,
    proof: { contactId?: string; orderReference?: string },
  ) {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows: ShipmentRow[] = await tx`
          SELECT * FROM chai.shipment
          WHERE tenant_id = ${tenantId}
            AND tracking_number = ${trackingNumber}
        `;
        const row = rows[0];
        if (!row) return null;

        const ownsByContact =
          proof.contactId !== undefined &&
          row.contact_id !== null &&
          proof.contactId === row.contact_id;
        const ownsByOrder =
          proof.orderReference !== undefined &&
          row.order_reference !== null &&
          proof.orderReference === row.order_reference;
        if (!ownsByContact && !ownsByOrder) {
          // Fail closed and reveal nothing: a guessed tracking number must not
          // confirm that a shipment exists (ADR-027).
          return null;
        }
        return this.toCustomerView(this.mapRecord(row));
      },
    );
  }

  override async appendEvent(
    tenantId: string,
    trackingNumber: string,
    event: {
      at: Date;
      code: ShipmentMilestone;
      description: string;
      providerEventId?: string;
    },
  ): Promise<ShipmentRecord | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows: ShipmentRow[] = await tx`
          SELECT * FROM chai.shipment
          WHERE tenant_id = ${tenantId}
            AND tracking_number = ${trackingNumber}
          FOR UPDATE
        `;
        if (rows.length === 0) return null;
        const current = rows[0] as ShipmentRow;
        const priorEvents = this.parseEvents(current.events);

        // Deduplicate on the provider's event id inside the row lock, so a
        // redelivered scan cannot be appended twice (acceptance LOG-03).
        if (
          event.providerEventId &&
          priorEvents.some((prior) => prior.eventId === event.providerEventId)
        ) {
          return this.mapRecord(current);
        }

        const newEvent: StoredEvent = {
          at: event.at.toISOString(),
          code: event.code,
          description: event.description,
          eventId: event.providerEventId ?? randomUUID(),
        };
        const events = [...priorEvents, newEvent].sort(
          (left, right) =>
            new Date(left.at).getTime() - new Date(right.at).getTime(),
        );
        // Status follows the latest event by PROVIDER time, not by arrival order:
        // an out-of-order redelivery must not roll the timeline backwards.
        const latest = events[events.length - 1];
        const status = (latest?.code ?? current.status) as ShipmentMilestone;

        return commitBusinessMutation(tx, {
          tenantId,
          mutate: async () => {
            await tx`
              UPDATE chai.shipment
              SET events = ${tx.json(events as unknown as Parameters<typeof tx.json>[0])}::jsonb,
                  status = ${status},
                  last_synced_at = now(),
                  updated_at = now()
              WHERE id = ${current.id}
            `;
            return this.mapRecord({
              ...current,
              events,
              status,
              last_synced_at: new Date(),
              updated_at: new Date(),
            });
          },
          describe: (updatedRecord) => ({
            audit: {
              action: 'shipment.event_appended',
              actorId: SERVICE_PRINCIPAL_ID,
              metadata: { carrier: current.carrier, eventCode: event.code, trackingNumber: current.tracking_number },
              resourceId: current.id,
              resourceType: 'shipment',
            },
            events: [
              {
                aggregateId: current.id,
                aggregateType: 'shipment',
                aggregateVersion: 1,
                eventType: 'shipment.updated',
                partitionKey: current.tracking_number,
                payload: { carrier: current.carrier, eventCode: event.code, status: updatedRecord.status, trackingNumber: current.tracking_number },
              },
            ],
          }),
        });
      },
    );
  }

  override setKillSwitch(enabled: boolean): void {
    this.killSwitch = enabled;
  }

  override isKillSwitchOn(): boolean {
    return this.killSwitch;
  }

  private parseEvents(raw: StoredEvent[] | string | undefined): StoredEvent[] {
    if (!raw) return [];
    if (typeof raw === 'string') return JSON.parse(raw) as StoredEvent[];
    return raw;
  }

  private mapRecord(row: ShipmentRow): ShipmentRecord {
    const stored = this.parseEvents(row.events);
    const events: TrackingEvent[] = stored.map((event) => ({
      at: new Date(event.at),
      code: event.code,
      description: event.description,
      eventId: event.eventId,
    }));
    events.sort((a, b) => a.at.getTime() - b.at.getTime());
    const last = events[events.length - 1];
    return {
      carrier: row.carrier,
      events,
      lastSyncedAt: new Date(row.last_synced_at),
      status: last?.code ?? row.status,
      tenantId: row.tenant_id,
      trackingNumber: row.tracking_number,
    };
  }
}
