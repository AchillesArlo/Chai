import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPaymentStateMachineRepository } from '../src/modules/payment-state-machine/payment-state-machine.repository';

describe('PaymentStateMachineRepository', () => {
  let repo: InMemoryPaymentStateMachineRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryPaymentStateMachineRepository();
  });

  describe('Payment Requests', () => {
    it('should create payment request', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: 'order-123',
        amount: 100.00,
        currency: 'USD',
        status: 'created',
        paymentMethod: 'credit_card',
        metadata: {},
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      expect(request.id).toBeDefined();
      expect(request.amount).toBe(100.00);
      expect(request.status).toBe('created');
    });

    it('should list payment requests by tenant', async () => {
      await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 50.00,
        currency: 'USD',
        status: 'pending',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      const requests = await repo.listPaymentRequests(tenantId);
      expect(requests).toHaveLength(1);
    });

    it('should update payment request status', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 75.00,
        currency: 'USD',
        status: 'pending',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      const updated = await repo.updatePaymentRequest(request.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('Payment Attempts', () => {
    it('should create payment attempt', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 100.00,
        currency: 'USD',
        status: 'pending',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      const attempt = await repo.createPaymentAttempt({
        paymentRequestId: request.id,
        tenantId,
        attemptNumber: 1,
        provider: 'stripe',
        providerReference: null,
        amount: 100.00,
        currency: 'USD',
        status: 'initiated',
        errorCode: null,
        errorMessage: null,
        providerResponse: null,
      });

      expect(attempt.id).toBeDefined();
      expect(attempt.provider).toBe('stripe');
      expect(attempt.attemptNumber).toBe(1);
    });

    it('should list attempts by request', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 100.00,
        currency: 'USD',
        status: 'pending',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      await repo.createPaymentAttempt({
        paymentRequestId: request.id,
        tenantId,
        attemptNumber: 1,
        provider: 'stripe',
        providerReference: null,
        amount: 100.00,
        currency: 'USD',
        status: 'failed',
        errorCode: 'card_declined',
        errorMessage: 'Card declined',
        providerResponse: null,
      });

      await repo.createPaymentAttempt({
        paymentRequestId: request.id,
        tenantId,
        attemptNumber: 2,
        provider: 'stripe',
        providerReference: 'ch_123',
        amount: 100.00,
        currency: 'USD',
        status: 'succeeded',
        errorCode: null,
        errorMessage: null,
        providerResponse: { chargeId: 'ch_123' },
      });

      const attempts = await repo.listPaymentAttempts(request.id);
      expect(attempts).toHaveLength(2);
    });
  });

  describe('Refunds', () => {
    it('should create refund', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 100.00,
        currency: 'USD',
        status: 'completed',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      const refund = await repo.createRefund({
        paymentRequestId: request.id,
        tenantId,
        amount: 50.00,
        reason: 'Customer request',
        status: 'requested',
        provider: null,
        providerReference: null,
        metadata: {},
      });

      expect(refund.id).toBeDefined();
      expect(refund.amount).toBe(50.00);
      expect(refund.status).toBe('requested');
    });

    it('should list refunds by request', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 100.00,
        currency: 'USD',
        status: 'completed',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      await repo.createRefund({
        paymentRequestId: request.id,
        tenantId,
        amount: 25.00,
        reason: 'Partial refund',
        status: 'completed',
        provider: 'stripe',
        providerReference: 're_123',
        metadata: {},
      });

      const refunds = await repo.listRefunds(request.id);
      expect(refunds).toHaveLength(1);
    });
  });

  describe('Disputes', () => {
    it('should create dispute', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 100.00,
        currency: 'USD',
        status: 'completed',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      const dispute = await repo.createDispute({
        paymentRequestId: request.id,
        tenantId,
        disputeId: 'dp_123',
        reason: 'fraudulent',
        amount: 100.00,
        status: 'opened',
        evidence: [],
        providerResponse: null,
      });

      expect(dispute.id).toBeDefined();
      expect(dispute.disputeId).toBe('dp_123');
      expect(dispute.status).toBe('opened');
    });

    it('should update dispute status', async () => {
      const request = await repo.createPaymentRequest({
        tenantId,
        orderId: null,
        amount: 100.00,
        currency: 'USD',
        status: 'completed',
        paymentMethod: null,
        metadata: {},
        expiresAt: null,
      });

      const dispute = await repo.createDispute({
        paymentRequestId: request.id,
        tenantId,
        disputeId: 'dp_123',
        reason: 'fraudulent',
        amount: 100.00,
        status: 'opened',
        evidence: [],
        providerResponse: null,
      });

      const updated = await repo.updateDispute(dispute.id, {
        status: 'won',
        resolvedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('won');
      expect(updated.resolvedAt).toBeDefined();
    });
  });
});
