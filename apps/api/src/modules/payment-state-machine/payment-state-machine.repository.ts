import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface PaymentRequest {
  id: string;
  tenantId: string;
  orderId: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
  paymentMethod: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface PaymentAttempt {
  id: string;
  paymentRequestId: string;
  tenantId: string;
  attemptNumber: number;
  provider: string;
  providerReference: string | null;
  amount: number;
  currency: string;
  status: 'initiated' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  errorCode: string | null;
  errorMessage: string | null;
  providerResponse: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Refund {
  id: string;
  paymentRequestId: string;
  tenantId: string;
  amount: number;
  reason: string | null;
  status: 'requested' | 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';
  provider: string | null;
  providerReference: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Dispute {
  id: string;
  paymentRequestId: string;
  tenantId: string;
  disputeId: string;
  reason: string;
  amount: number;
  status: 'opened' | 'under_review' | 'evidence_submitted' | 'won' | 'lost' | 'closed';
  evidence: unknown[]; // free-form JSONB (schema-less)
  providerResponse: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export abstract class PaymentStateMachineRepository {
  abstract createPaymentRequest(request: Omit<PaymentRequest, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>): Promise<PaymentRequest>;
  abstract getPaymentRequest(id: string): Promise<PaymentRequest | null>;
  abstract listPaymentRequests(tenantId: string, status?: string): Promise<PaymentRequest[]>;
  abstract updatePaymentRequest(id: string, update: Partial<PaymentRequest>): Promise<PaymentRequest>;

  abstract createPaymentAttempt(attempt: Omit<PaymentAttempt, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>): Promise<PaymentAttempt>;
  abstract getPaymentAttempt(id: string): Promise<PaymentAttempt | null>;
  abstract listPaymentAttempts(paymentRequestId: string): Promise<PaymentAttempt[]>;
  abstract updatePaymentAttempt(id: string, update: Partial<PaymentAttempt>): Promise<PaymentAttempt>;

  abstract createRefund(refund: Omit<Refund, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>): Promise<Refund>;
  abstract getRefund(id: string): Promise<Refund | null>;
  abstract listRefunds(paymentRequestId: string): Promise<Refund[]>;
  abstract updateRefund(id: string, update: Partial<Refund>): Promise<Refund>;

  abstract createDispute(dispute: Omit<Dispute, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt'>): Promise<Dispute>;
  abstract getDispute(id: string): Promise<Dispute | null>;
  abstract listDisputes(paymentRequestId: string): Promise<Dispute[]>;
  abstract updateDispute(id: string, update: Partial<Dispute>): Promise<Dispute>;
}

@Injectable()
export class InMemoryPaymentStateMachineRepository extends PaymentStateMachineRepository {
  private requests = new Map<string, PaymentRequest>();
  private attempts = new Map<string, PaymentAttempt>();
  private refunds = new Map<string, Refund>();
  private disputes = new Map<string, Dispute>();

  async createPaymentRequest(request: Omit<PaymentRequest, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>): Promise<PaymentRequest> {
    const now = new Date().toISOString();
    const newRequest: PaymentRequest = {
      ...request,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.requests.set(newRequest.id, newRequest);
    return newRequest;
  }

  async getPaymentRequest(id: string): Promise<PaymentRequest | null> {
    return this.requests.get(id) || null;
  }

  async listPaymentRequests(tenantId: string, status?: string): Promise<PaymentRequest[]> {
    return Array.from(this.requests.values()).filter(r => {
      if (r.tenantId !== tenantId) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }

  async updatePaymentRequest(id: string, update: Partial<PaymentRequest>): Promise<PaymentRequest> {
    const request = this.requests.get(id);
    if (!request) throw new Error('Payment request not found');
    const updated = { ...request, ...update, updatedAt: new Date().toISOString() };
    this.requests.set(id, updated);
    return updated;
  }

  async createPaymentAttempt(attempt: Omit<PaymentAttempt, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>): Promise<PaymentAttempt> {
    const now = new Date().toISOString();
    const newAttempt: PaymentAttempt = {
      ...attempt,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.attempts.set(newAttempt.id, newAttempt);
    return newAttempt;
  }

  async getPaymentAttempt(id: string): Promise<PaymentAttempt | null> {
    return this.attempts.get(id) || null;
  }

  async listPaymentAttempts(paymentRequestId: string): Promise<PaymentAttempt[]> {
    return Array.from(this.attempts.values()).filter(a => a.paymentRequestId === paymentRequestId);
  }

  async updatePaymentAttempt(id: string, update: Partial<PaymentAttempt>): Promise<PaymentAttempt> {
    const attempt = this.attempts.get(id);
    if (!attempt) throw new Error('Payment attempt not found');
    const updated = { ...attempt, ...update, updatedAt: new Date().toISOString() };
    this.attempts.set(id, updated);
    return updated;
  }

  async createRefund(refund: Omit<Refund, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>): Promise<Refund> {
    const now = new Date().toISOString();
    const newRefund: Refund = {
      ...refund,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.refunds.set(newRefund.id, newRefund);
    return newRefund;
  }

  async getRefund(id: string): Promise<Refund | null> {
    return this.refunds.get(id) || null;
  }

  async listRefunds(paymentRequestId: string): Promise<Refund[]> {
    return Array.from(this.refunds.values()).filter(r => r.paymentRequestId === paymentRequestId);
  }

  async updateRefund(id: string, update: Partial<Refund>): Promise<Refund> {
    const refund = this.refunds.get(id);
    if (!refund) throw new Error('Refund not found');
    const updated = { ...refund, ...update, updatedAt: new Date().toISOString() };
    this.refunds.set(id, updated);
    return updated;
  }

  async createDispute(dispute: Omit<Dispute, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt'>): Promise<Dispute> {
    const now = new Date().toISOString();
    const newDispute: Dispute = {
      ...dispute,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    this.disputes.set(newDispute.id, newDispute);
    return newDispute;
  }

  async getDispute(id: string): Promise<Dispute | null> {
    return this.disputes.get(id) || null;
  }

  async listDisputes(paymentRequestId: string): Promise<Dispute[]> {
    return Array.from(this.disputes.values()).filter(d => d.paymentRequestId === paymentRequestId);
  }

  async updateDispute(id: string, update: Partial<Dispute>): Promise<Dispute> {
    const dispute = this.disputes.get(id);
    if (!dispute) throw new Error('Dispute not found');
    const updated = { ...dispute, ...update, updatedAt: new Date().toISOString() };
    this.disputes.set(id, updated);
    return updated;
  }
}
