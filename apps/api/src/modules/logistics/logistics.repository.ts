import { Injectable } from '@nestjs/common';

import {
  createMockShippingAdapter,
  type MockShippingAdapter,
  type ShipmentMilestone,
  type ShipmentRecord,
} from '@chai/connectors/mock-shipping';

export abstract class LogisticsRepository {
  abstract link(
    tenantId: string,
    input: {
      carrier: string;
      /** Owning contact, recorded so a customer lookup can be verified. */
      contactId?: string;
      orderReference?: string;
      trackingNumber: string;
    },
  ): Promise<ShipmentRecord>;

  abstract get(
    tenantId: string,
    trackingNumber: string,
  ): Promise<ShipmentRecord | null>;

  abstract listShipments(tenantId: string): Promise<ShipmentRecord[]>;

  abstract customerView(
    tenantId: string,
    trackingNumber: string,
  ): Promise<{
    carrier: string;
    status: ShipmentMilestone;
    trackingNumber: string;
    timeline: Array<{ at: string; code: ShipmentMilestone; description: string }>;
  } | null>;

  /**
   * Customer-facing lookup.
   *
   * Requires proof of ownership — the owning contact or the order reference —
   * because a tracking number alone is guessable. A shipment with no recorded
   * owner fails closed (17_PAYMENT §7.3, ADR-027).
   */
  abstract customerLookup(
    tenantId: string,
    trackingNumber: string,
    proof: { contactId?: string; orderReference?: string },
  ): Promise<{
    carrier: string;
    status: ShipmentMilestone;
    trackingNumber: string;
    timeline: Array<{ at: string; code: ShipmentMilestone; description: string }>;
  } | null>;

  abstract appendEvent(
    tenantId: string,
    trackingNumber: string,
    event: {
      at: Date;
      code: ShipmentMilestone;
      description: string;
      /** Provider's own event id, used to deduplicate redeliveries. */
      providerEventId?: string;
    },
  ): Promise<ShipmentRecord | null>;

  abstract setKillSwitch(enabled: boolean): void;

  abstract isKillSwitchOn(): boolean;
}

@Injectable()
export class InMemoryLogisticsRepository extends LogisticsRepository {
  private readonly adapter: MockShippingAdapter = createMockShippingAdapter();
  /** Recorded ownership, mirroring the shipment columns in the database path. */
  private readonly ownership = new Map<
    string,
    { contactId?: string; orderReference?: string }
  >();

  override async link(
    tenantId: string,
    input: {
      carrier: string;
      contactId?: string;
      orderReference?: string;
      trackingNumber: string;
    },
  ): Promise<ShipmentRecord> {
    if (input.contactId || input.orderReference) {
      this.ownership.set(`${tenantId}:${input.trackingNumber}`, {
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.orderReference
          ? { orderReference: input.orderReference }
          : {}),
      });
    }
    return this.adapter.linkShipment({
      carrier: input.carrier,
      tenantId,
      trackingNumber: input.trackingNumber,
    });
  }

  override async customerLookup(
    tenantId: string,
    trackingNumber: string,
    proof: { contactId?: string; orderReference?: string },
  ) {
    const owner = this.ownership.get(`${tenantId}:${trackingNumber}`);
    // No recorded owner, or proof that does not match it, reveals nothing.
    if (!owner) return null;
    const matches =
      (proof.contactId !== undefined && proof.contactId === owner.contactId) ||
      (proof.orderReference !== undefined &&
        proof.orderReference === owner.orderReference);
    if (!matches) return null;
    return this.adapter.customerView(tenantId, trackingNumber);
  }

  override async get(
    tenantId: string,
    trackingNumber: string,
  ): Promise<ShipmentRecord | null> {
    return this.adapter.getShipment(tenantId, trackingNumber);
  }

  override async listShipments(tenantId: string): Promise<ShipmentRecord[]> {
    return this.adapter.listShipments(tenantId);
  }

  override async customerView(tenantId: string, trackingNumber: string) {
    return this.adapter.customerView(tenantId, trackingNumber);
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
    return this.adapter.appendEvent(tenantId, trackingNumber, {
      at: event.at,
      code: event.code,
      description: event.description,
      ...(event.providerEventId ? { eventId: event.providerEventId } : {}),
    });
  }

  override setKillSwitch(enabled: boolean): void {
    this.adapter.setKillSwitch(enabled);
  }

  override isKillSwitchOn(): boolean {
    return this.adapter.isKillSwitchOn();
  }
}
