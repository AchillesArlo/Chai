import { Inject, Injectable } from '@nestjs/common';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';
import {
  cancelSubscription,
  createSubscription,
  getRefund,
  listRefundsForPayment,
  listSettlements,
  listSubscriptions,
  processRefund,
  type BillingCycle,
  type RefundRecord,
  type SettlementRecord,
  type SubscriptionRecord,
} from '@chai/domain';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';
import { AdvancedPaymentsRepository } from './advanced-payments.repository';

@Injectable()
export class PostgresAdvancedPaymentsRepository extends AdvancedPaymentsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

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
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx) =>
        createSubscription(tx, {
          amountCents: input.amountCents,
          billingCycle: input.billingCycle,
          currency: input.currency,
          customerId: input.customerId,
          idempotencyKey: input.idempotencyKey,
          planId: input.planId,
          providerRef: input.providerRef,
        }),
    );
  }

  override async listSubscriptions(
    tenantId: string,
    customerId?: string,
  ): Promise<SubscriptionRecord[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx) => listSubscriptions(tx, customerId),
    );
  }

  override async cancelSubscription(
    tenantId: string,
    subscriptionId: string,
  ): Promise<SubscriptionRecord> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx) => cancelSubscription(tx, subscriptionId),
    );
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
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx) =>
        processRefund(tx, {
          amountCents: input.amountCents,
          idempotencyKey: input.idempotencyKey,
          paymentId: input.paymentId,
          providerRef: input.providerRef,
          reason: input.reason,
        }),
    );
  }

  override async getRefund(
    tenantId: string,
    refundId: string,
  ): Promise<RefundRecord | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx) => getRefund(tx, refundId),
    );
  }

  override async listSettlements(tenantId: string): Promise<SettlementRecord[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx) => listSettlements(tx),
    );
  }

  /** Test helper exposing the domain listRefundsForPayment under tenant scope. */
  async listRefundsForPayment(
    tenantId: string,
    paymentId: string,
  ): Promise<RefundRecord[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx) => listRefundsForPayment(tx, paymentId),
    );
  }
}
