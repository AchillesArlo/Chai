import { Injectable } from '@nestjs/common';

import type {
  BillingCycle,
  RefundRecord,
  RefundStatus,
  SettlementRecord,
  SubscriptionRecord,
  SubscriptionStatus,
} from '@chai/domain';

/**
 * S4-1: read/write port for advanced payment concepts (subscriptions, refunds,
 * settlements). Implementations swap between InMemory (tests/no-DB) and Postgres
 * via the module factory. Mirrors the Leads/Knowledge repository pattern.
 */
export abstract class AdvancedPaymentsRepository {
  abstract createSubscription(
    tenantId: string,
    input: {
      amountCents: number;
      billingCycle: BillingCycle;
      currency: string;
      customerId: string;
      idempotencyKey: string;
      planId: string;
      providerRef?: string;
    },
  ): Promise<SubscriptionRecord>;

  abstract listSubscriptions(tenantId: string, customerId?: string): Promise<SubscriptionRecord[]>;

  abstract cancelSubscription(tenantId: string, subscriptionId: string): Promise<SubscriptionRecord>;

  abstract processRefund(
    tenantId: string,
    input: {
      amountCents: number;
      idempotencyKey: string;
      paymentId: string;
      providerRef?: string;
      reason: string;
    },
  ): Promise<RefundRecord>;

  abstract getRefund(tenantId: string, refundId: string): Promise<RefundRecord | null>;

  abstract listSettlements(tenantId: string): Promise<SettlementRecord[]>;
}

interface InMemorySubscription extends SubscriptionRecord {
  cancelled?: boolean;
}

@Injectable()
export class InMemoryAdvancedPaymentsRepository extends AdvancedPaymentsRepository {
  private readonly subscriptions = new Map<string, InMemorySubscription>();
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly settlements = new Map<string, SettlementRecord[]>();
  private readonly subscriptionIdem = new Map<string, string>();
  private readonly refundIdem = new Map<string, string>();

  override async createSubscription(
    tenantId: string,
    input: {
      amountCents: number;
      billingCycle: BillingCycle;
      currency: string;
      customerId: string;
      idempotencyKey: string;
      planId: string;
      providerRef?: string;
    },
  ): Promise<SubscriptionRecord> {
    const idemKey = `${tenantId}:${input.idempotencyKey}`;
    const existingId = this.subscriptionIdem.get(idemKey);
    if (existingId) {
      const existing = this.subscriptions.get(existingId);
      if (existing) return this.toSubscription(existing);
    }

    const now = new Date();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + (input.billingCycle === 'YEARLY' ? 365 : 30));
    const record: InMemorySubscription = {
      amountCents: input.amountCents,
      billingCycle: input.billingCycle,
      currentPeriodEnd: end.toISOString(),
      currentPeriodStart: now.toISOString(),
      currency: input.currency,
      customerId: input.customerId,
      id: crypto.randomUUID(),
      planId: input.planId,
      providerRef: input.providerRef ?? null,
      status: 'ACTIVE',
      tenantId,
    };
    this.subscriptions.set(record.id, record);
    this.subscriptionIdem.set(idemKey, record.id);
    return this.toSubscription(record);
  }

  override async listSubscriptions(
    tenantId: string,
    customerId?: string,
  ): Promise<SubscriptionRecord[]> {
    const rows = [...this.subscriptions.values()].filter(
      (row) => row.tenantId === tenantId && (!customerId || row.customerId === customerId),
    );
    return rows.map((row) => this.toSubscription(row));
  }

  override async cancelSubscription(
    tenantId: string,
    subscriptionId: string,
  ): Promise<SubscriptionRecord> {
    const row = this.subscriptions.get(subscriptionId);
    if (!row || row.tenantId !== tenantId) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }
    row.status = 'CANCELLED';
    row.cancelled = true;
    this.subscriptions.set(subscriptionId, row);
    return this.toSubscription(row);
  }

  override async processRefund(
    tenantId: string,
    input: {
      amountCents: number;
      idempotencyKey: string;
      paymentId: string;
      providerRef?: string;
      reason: string;
    },
  ): Promise<RefundRecord> {
    const idemKey = `${tenantId}:${input.idempotencyKey}`;
    const existingId = this.refundIdem.get(idemKey);
    if (existingId) {
      const existing = this.refunds.get(existingId);
      if (existing) return existing;
    }

    const record: RefundRecord = {
      amountCents: input.amountCents,
      id: crypto.randomUUID(),
      paymentId: input.paymentId,
      providerRef: input.providerRef ?? null,
      reason: input.reason,
      status: 'COMPLETED',
      tenantId,
    };
    this.refunds.set(record.id, record);
    this.refundIdem.set(idemKey, record.id);
    return record;
  }

  override async getRefund(tenantId: string, refundId: string): Promise<RefundRecord | null> {
    const row = this.refunds.get(refundId);
    if (!row || row.tenantId !== tenantId) return null;
    return row;
  }

  override async listSettlements(tenantId: string): Promise<SettlementRecord[]> {
    return this.settlements.get(tenantId) ?? [];
  }

  private toSubscription(row: InMemorySubscription): SubscriptionRecord {
    const { cancelled, ...rest } = row;
    void cancelled;
    return rest;
  }
}

export type {
  BillingCycle,
  RefundRecord,
  RefundStatus,
  SettlementRecord,
  SubscriptionRecord,
  SubscriptionStatus,
};
