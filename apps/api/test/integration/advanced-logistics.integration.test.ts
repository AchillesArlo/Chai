import { describe, expect, it } from 'vitest';

import {
  InMemoryAdvancedLogisticsRepository,
} from '../../src/modules/advanced-logistics/advanced-logistics.repository';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-000000000001';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-000000000002';

describe('InMemoryAdvancedLogisticsRepository (S4-2)', () => {
  // ── Rate Shopping ──────────────────────────────────────────────────────────

  describe('rate shopping', () => {
    it('ranks rates by price and speed', () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const rates = [
        { carrier: 'JNE', currency: 'IDR', price: 50000, serviceType: 'REG', transitDays: 3 },
        { carrier: 'SiCepat', currency: 'IDR', price: 45000, serviceType: 'BEST', transitDays: 2 },
        { carrier: 'J&T', currency: 'IDR', price: 60000, serviceType: 'EXP', transitDays: 1 },
      ];

      const result = repo.shopRates(rates);

      expect(result.ranked).toHaveLength(3);
      expect(result.best).not.toBeNull();
      expect(result.best?.carrier).toBe('SiCepat'); // best balance
    });

    it('selects cheapest when speedWeight is 0', () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const rates = [
        { carrier: 'JNE', currency: 'IDR', price: 50000, serviceType: 'REG', transitDays: 3 },
        { carrier: 'SiCepat', currency: 'IDR', price: 45000, serviceType: 'BEST', transitDays: 2 },
      ];

      const result = repo.shopRates(rates, { priceWeight: 1, speedWeight: 0 });

      expect(result.best?.carrier).toBe('SiCepat');
    });

    it('selects fastest when priceWeight is 0', () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const rates = [
        { carrier: 'JNE', currency: 'IDR', price: 50000, serviceType: 'REG', transitDays: 3 },
        { carrier: 'J&T', currency: 'IDR', price: 60000, serviceType: 'EXP', transitDays: 1 },
      ];

      const result = repo.shopRates(rates, { priceWeight: 0, speedWeight: 1 });

      expect(result.best?.carrier).toBe('J&T');
    });
  });

  // ── Return Requests ────────────────────────────────────────────────────────

  describe('returns', () => {
    it('creates a return with PENDING status', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const returnReq = await repo.createReturn(TENANT_A, {
        reason: 'Wrong item received',
        originalShipmentId: 'shipment-123',
      });

      expect(returnReq.id).toBeTruthy();
      expect(returnReq.tenantId).toBe(TENANT_A);
      expect(returnReq.status).toBe('PENDING');
      expect(returnReq.reason).toBe('Wrong item received');
    });

    it('approves a return (PENDING → APPROVED)', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const returnReq = await repo.createReturn(TENANT_A, { reason: 'Defective' });

      const approved = await repo.approveReturn(TENANT_A, returnReq.id);

      expect(approved.status).toBe('APPROVED');
    });

    it('completes a return (APPROVED → COMPLETED)', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const returnReq = await repo.createReturn(TENANT_A, { reason: 'Defective' });
      await repo.approveReturn(TENANT_A, returnReq.id);

      const completed = await repo.completeReturn(TENANT_A, returnReq.id);

      expect(completed.status).toBe('COMPLETED');
    });

    it('rejects invalid transition (PENDING → COMPLETED)', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const returnReq = await repo.createReturn(TENANT_A, { reason: 'Defective' });

      await expect(repo.completeReturn(TENANT_A, returnReq.id)).rejects.toThrow(
        'RETURN_INVALID_TRANSITION',
      );
    });

    it('isolates returns by tenant', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const returnA = await repo.createReturn(TENANT_A, { reason: 'Tenant A return' });

      const fetched = await repo.getReturn(TENANT_B, returnA.id);
      expect(fetched).toBeNull();
    });

    it('gets return by ID', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const returnReq = await repo.createReturn(TENANT_A, { reason: 'Test' });

      const fetched = await repo.getReturn(TENANT_A, returnReq.id);

      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(returnReq.id);
    });
  });

  // ── Claims ─────────────────────────────────────────────────────────────────

  describe('claims', () => {
    it('creates a claim with OPEN status', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const claim = await repo.createClaim(TENANT_A, {
        category: 'DAMAGED',
        amountCents: 150000,
        shipmentId: 'shipment-456',
      });

      expect(claim.id).toBeTruthy();
      expect(claim.tenantId).toBe(TENANT_A);
      expect(claim.status).toBe('OPEN');
      expect(claim.category).toBe('DAMAGED');
      expect(claim.amountCents).toBe(150000);
    });

    it('investigates a claim (OPEN → INVESTIGATING)', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const claim = await repo.createClaim(TENANT_A, {
        category: 'LOST',
        amountCents: 200000,
      });

      const investigating = await repo.investigateClaim(TENANT_A, claim.id);

      expect(investigating.status).toBe('INVESTIGATING');
    });

    it('resolves a claim (INVESTIGATING → RESOLVED)', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const claim = await repo.createClaim(TENANT_A, {
        category: 'WRONG_ITEM',
        amountCents: 100000,
      });
      await repo.investigateClaim(TENANT_A, claim.id);

      const resolved = await repo.resolveClaim(TENANT_A, claim.id, 'Refund issued');

      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.resolution).toBe('Refund issued');
    });

    it('resolves a claim directly from OPEN', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const claim = await repo.createClaim(TENANT_A, {
        category: 'DAMAGED',
        amountCents: 50000,
      });

      const resolved = await repo.resolveClaim(TENANT_A, claim.id, 'Claim denied');

      expect(resolved.status).toBe('RESOLVED');
    });

    it('rejects invalid transition (RESOLVED → INVESTIGATING)', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const claim = await repo.createClaim(TENANT_A, {
        category: 'DAMAGED',
        amountCents: 50000,
      });
      await repo.resolveClaim(TENANT_A, claim.id, 'Done');

      await expect(repo.investigateClaim(TENANT_A, claim.id)).rejects.toThrow(
        'CLAIM_INVALID_TRANSITION',
      );
    });

    it('isolates claims by tenant', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const claimA = await repo.createClaim(TENANT_A, {
        category: 'LOST',
        amountCents: 100000,
      });

      const fetched = await repo.getClaim(TENANT_B, claimA.id);
      expect(fetched).toBeNull();
    });
  });

  // ── ETA Predictions ────────────────────────────────────────────────────────

  describe('ETA predictions', () => {
    it('refuses to invent a date when there is no signal to predict from', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      const prediction = await repo.predictEta(TENANT_A, {
        shipmentId: 'shipment-789',
        origin: 'Jakarta',
        destination: 'Bandung',
        carrier: 'JNE',
        serviceType: 'REG',
      });

      expect(prediction.id).toBeTruthy();
      expect(prediction.tenantId).toBe(TENANT_A);
      expect(prediction.shipmentId).toBe('shipment-789');
      // A carrier name and two city strings are not a delivery estimate. Showing
      // a customer a fabricated date is worse than showing none (17 §7.5).
      expect(prediction.predictedDate).toBeNull();
      expect(prediction.confidence).toBe('NONE');
    });

    it('caches ETA prediction', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      await repo.predictEta(TENANT_A, {
        shipmentId: 'shipment-123',
        origin: 'Jakarta',
        destination: 'Surabaya',
        carrier: 'SiCepat',
        serviceType: 'BEST',
      });

      const cached = await repo.getEta(TENANT_A, 'shipment-123');

      expect(cached).not.toBeNull();
      expect(cached?.shipmentId).toBe('shipment-123');
    });

    it('returns null for uncached ETA', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();

      const eta = await repo.getEta(TENANT_A, 'nonexistent-shipment');

      expect(eta).toBeNull();
    });

    it('isolates ETA by tenant', async () => {
      const repo = new InMemoryAdvancedLogisticsRepository();
      await repo.predictEta(TENANT_A, {
        shipmentId: 'shipment-abc',
        origin: 'Jakarta',
        destination: 'Medan',
        carrier: 'J&T',
        serviceType: 'EXP',
      });

      const eta = await repo.getEta(TENANT_B, 'shipment-abc');
      expect(eta).toBeNull();
    });
  });
});
