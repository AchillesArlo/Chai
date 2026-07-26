import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Shipment {
  id: string;
  tenantId: string;
  orderId: string | null;
  trackingNumber: string | null;
  carrier: string;
  serviceLevel: string | null;
  status: 'created' | 'label_created' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned' | 'cancelled';
  originAddress: Record<string, unknown>; // free-form JSONB (schema-less)
  destinationAddress: Record<string, unknown>;
  weightKg: number | null;
  dimensions: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  estimatedDelivery: string | null;
  createdAt: string;
  updatedAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}

export interface ShipmentEvent {
  id: string;
  shipmentId: string;
  tenantId: string;
  eventType: string;
  status: string;
  location: Record<string, unknown> | null;
  description: string | null;
  providerEventId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface ShipmentPackage {
  id: string;
  shipmentId: string;
  tenantId: string;
  packageNumber: number;
  weightKg: number | null;
  dimensions: Record<string, unknown> | null;
  contents: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export abstract class ShipmentStateMachineRepository {
  abstract createShipment(shipment: Omit<Shipment, 'id' | 'createdAt' | 'updatedAt' | 'pickedUpAt' | 'deliveredAt'>): Promise<Shipment>;
  abstract getShipment(id: string): Promise<Shipment | null>;
  abstract listShipments(tenantId: string, status?: string): Promise<Shipment[]>;
  abstract updateShipment(id: string, update: Partial<Shipment>): Promise<Shipment>;

  abstract createShipmentEvent(event: Omit<ShipmentEvent, 'id' | 'createdAt'>): Promise<ShipmentEvent>;
  abstract getShipmentEvent(id: string): Promise<ShipmentEvent | null>;
  abstract listShipmentEvents(shipmentId: string): Promise<ShipmentEvent[]>;

  abstract createShipmentPackage(pkg: Omit<ShipmentPackage, 'id' | 'createdAt' | 'updatedAt'>): Promise<ShipmentPackage>;
  abstract getShipmentPackage(id: string): Promise<ShipmentPackage | null>;
  abstract listShipmentPackages(shipmentId: string): Promise<ShipmentPackage[]>;
  abstract updateShipmentPackage(id: string, update: Partial<ShipmentPackage>): Promise<ShipmentPackage>;
}

@Injectable()
export class InMemoryShipmentStateMachineRepository extends ShipmentStateMachineRepository {
  private shipments = new Map<string, Shipment>();
  private events = new Map<string, ShipmentEvent>();
  private packages = new Map<string, ShipmentPackage>();

  async createShipment(shipment: Omit<Shipment, 'id' | 'createdAt' | 'updatedAt' | 'pickedUpAt' | 'deliveredAt'>): Promise<Shipment> {
    const now = new Date().toISOString();
    const newShipment: Shipment = {
      ...shipment,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      pickedUpAt: null,
      deliveredAt: null,
    };
    this.shipments.set(newShipment.id, newShipment);
    return newShipment;
  }

  async getShipment(id: string): Promise<Shipment | null> {
    return this.shipments.get(id) || null;
  }

  async listShipments(tenantId: string, status?: string): Promise<Shipment[]> {
    return Array.from(this.shipments.values()).filter(s => {
      if (s.tenantId !== tenantId) return false;
      if (status && s.status !== status) return false;
      return true;
    });
  }

  async updateShipment(id: string, update: Partial<Shipment>): Promise<Shipment> {
    const shipment = this.shipments.get(id);
    if (!shipment) throw new Error('Shipment not found');
    const updated = { ...shipment, ...update, updatedAt: new Date().toISOString() };
    this.shipments.set(id, updated);
    return updated;
  }

  async createShipmentEvent(event: Omit<ShipmentEvent, 'id' | 'createdAt'>): Promise<ShipmentEvent> {
    const newEvent: ShipmentEvent = {
      ...event,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.events.set(newEvent.id, newEvent);
    return newEvent;
  }

  async getShipmentEvent(id: string): Promise<ShipmentEvent | null> {
    return this.events.get(id) || null;
  }

  async listShipmentEvents(shipmentId: string): Promise<ShipmentEvent[]> {
    return Array.from(this.events.values())
      .filter(e => e.shipmentId === shipmentId)
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }

  async createShipmentPackage(pkg: Omit<ShipmentPackage, 'id' | 'createdAt' | 'updatedAt'>): Promise<ShipmentPackage> {
    const now = new Date().toISOString();
    const newPackage: ShipmentPackage = {
      ...pkg,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.packages.set(newPackage.id, newPackage);
    return newPackage;
  }

  async getShipmentPackage(id: string): Promise<ShipmentPackage | null> {
    return this.packages.get(id) || null;
  }

  async listShipmentPackages(shipmentId: string): Promise<ShipmentPackage[]> {
    return Array.from(this.packages.values())
      .filter(p => p.shipmentId === shipmentId)
      .sort((a, b) => a.packageNumber - b.packageNumber);
  }

  async updateShipmentPackage(id: string, update: Partial<ShipmentPackage>): Promise<ShipmentPackage> {
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error('Shipment package not found');
    const updated = { ...pkg, ...update, updatedAt: new Date().toISOString() };
    this.packages.set(id, updated);
    return updated;
  }
}
