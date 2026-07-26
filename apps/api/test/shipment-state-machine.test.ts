import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryShipmentStateMachineRepository } from '../src/modules/shipment-state-machine/shipment-state-machine.repository';

describe('ShipmentStateMachineRepository', () => {
  let repo: InMemoryShipmentStateMachineRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryShipmentStateMachineRepository();
  });

  describe('Shipments', () => {
    it('should create shipment', async () => {
      const shipment = await repo.createShipment({
        tenantId,
        orderId: 'order-123',
        trackingNumber: null,
        carrier: 'fedex',
        serviceLevel: 'express',
        status: 'created',
        originAddress: { street: '123 Main St', city: 'Jakarta' },
        destinationAddress: { street: '456 Oak Ave', city: 'Bandung' },
        weightKg: 2.5,
        dimensions: null,
        metadata: {},
        estimatedDelivery: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(shipment.id).toBeDefined();
      expect(shipment.carrier).toBe('fedex');
      expect(shipment.status).toBe('created');
    });

    it('should list shipments by tenant', async () => {
      await repo.createShipment({
        tenantId,
        orderId: null,
        trackingNumber: null,
        carrier: 'jne',
        serviceLevel: 'regular',
        status: 'in_transit',
        originAddress: { city: 'Jakarta' },
        destinationAddress: { city: 'Surabaya' },
        weightKg: 1.0,
        dimensions: null,
        metadata: {},
        estimatedDelivery: null,
      });

      const shipments = await repo.listShipments(tenantId);
      expect(shipments).toHaveLength(1);
    });

    it('should update shipment status', async () => {
      const shipment = await repo.createShipment({
        tenantId,
        orderId: null,
        trackingNumber: 'TRK123',
        carrier: 'tiki',
        serviceLevel: null,
        status: 'created',
        originAddress: { city: 'Jakarta' },
        destinationAddress: { city: 'Medan' },
        weightKg: 3.0,
        dimensions: null,
        metadata: {},
        estimatedDelivery: null,
      });

      const updated = await repo.updateShipment(shipment.id, {
        status: 'in_transit',
        pickedUpAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('in_transit');
      expect(updated.pickedUpAt).toBeDefined();
    });
  });

  describe('Shipment Events', () => {
    it('should create shipment event', async () => {
      const shipment = await repo.createShipment({
        tenantId,
        orderId: null,
        trackingNumber: 'TRK123',
        carrier: 'fedex',
        serviceLevel: null,
        status: 'in_transit',
        originAddress: { city: 'Jakarta' },
        destinationAddress: { city: 'Bandung' },
        weightKg: 2.0,
        dimensions: null,
        metadata: {},
        estimatedDelivery: null,
      });

      const event = await repo.createShipmentEvent({
        shipmentId: shipment.id,
        tenantId,
        eventType: 'in_transit',
        status: 'in_transit',
        location: { city: 'Semarang', lat: -6.9667, lng: 110.4167 },
        description: 'Package in transit',
        providerEventId: null,
        metadata: {},
        occurredAt: new Date().toISOString(),
      });

      expect(event.id).toBeDefined();
      expect(event.eventType).toBe('in_transit');
    });

    it('should list events by shipment', async () => {
      const shipment = await repo.createShipment({
        tenantId,
        orderId: null,
        trackingNumber: 'TRK123',
        carrier: 'jne',
        serviceLevel: null,
        status: 'delivered',
        originAddress: { city: 'Jakarta' },
        destinationAddress: { city: 'Bandung' },
        weightKg: 1.5,
        dimensions: null,
        metadata: {},
        estimatedDelivery: null,
      });

      await repo.createShipmentEvent({
        shipmentId: shipment.id,
        tenantId,
        eventType: 'picked_up',
        status: 'picked_up',
        location: null,
        description: 'Package picked up',
        providerEventId: null,
        metadata: {},
        occurredAt: new Date(Date.now() - 86400000).toISOString(),
      });

      await repo.createShipmentEvent({
        shipmentId: shipment.id,
        tenantId,
        eventType: 'delivered',
        status: 'delivered',
        location: null,
        description: 'Package delivered',
        providerEventId: null,
        metadata: {},
        occurredAt: new Date().toISOString(),
      });

      const events = await repo.listShipmentEvents(shipment.id);
      expect(events).toHaveLength(2);
    });
  });

  describe('Shipment Packages', () => {
    it('should create shipment package', async () => {
      const shipment = await repo.createShipment({
        tenantId,
        orderId: null,
        trackingNumber: 'TRK123',
        carrier: 'tiki',
        serviceLevel: null,
        status: 'created',
        originAddress: { city: 'Jakarta' },
        destinationAddress: { city: 'Surabaya' },
        weightKg: 5.0,
        dimensions: null,
        metadata: {},
        estimatedDelivery: null,
      });

      const pkg = await repo.createShipmentPackage({
        shipmentId: shipment.id,
        tenantId,
        packageNumber: 1,
        weightKg: 2.5,
        dimensions: { length: 30, width: 20, height: 15 },
        contents: { items: ['item1', 'item2'] },
        status: 'pending',
      });

      expect(pkg.id).toBeDefined();
      expect(pkg.packageNumber).toBe(1);
      expect(pkg.weightKg).toBe(2.5);
    });

    it('should list packages by shipment', async () => {
      const shipment = await repo.createShipment({
        tenantId,
        orderId: null,
        trackingNumber: 'TRK123',
        carrier: 'fedex',
        serviceLevel: null,
        status: 'created',
        originAddress: { city: 'Jakarta' },
        destinationAddress: { city: 'Bandung' },
        weightKg: 10.0,
        dimensions: null,
        metadata: {},
        estimatedDelivery: null,
      });

      await repo.createShipmentPackage({
        shipmentId: shipment.id,
        tenantId,
        packageNumber: 1,
        weightKg: 5.0,
        dimensions: null,
        contents: null,
        status: 'pending',
      });

      await repo.createShipmentPackage({
        shipmentId: shipment.id,
        tenantId,
        packageNumber: 2,
        weightKg: 5.0,
        dimensions: null,
        contents: null,
        status: 'pending',
      });

      const packages = await repo.listShipmentPackages(shipment.id);
      expect(packages).toHaveLength(2);
    });
  });
});
