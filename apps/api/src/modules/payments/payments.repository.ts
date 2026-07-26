import { Injectable } from '@nestjs/common';

import {
  createMockPaymentAdapter,
  verifyMockPaymentWebhookSignature,
  type MockPaymentAdapter,
  type PaymentSession,
  type PaymentStatus,
} from '@chai/connectors/mock-payment';

import { decidePaymentTransition } from '@chai/domain';

export abstract class PaymentsRepository {
  abstract createCheckout(
    tenantId: string,
    input: {
      amount: number;
      currency: string;
      idempotencyKey: string;
    },
  ): Promise<PaymentSession>;

  abstract getSession(
    tenantId: string,
    externalId: string,
  ): Promise<PaymentSession | null>;

  abstract listSessions(tenantId: string): Promise<PaymentSession[]>;

  abstract applyWebhook(
    raw: Uint8Array,
    signature: string | undefined,
  ): Promise<{ event: { externalId: string; status: PaymentStatus; tenantId: string } | null; verified: boolean }>;

  abstract setKillSwitch(enabled: boolean): void;

  abstract isKillSwitchOn(): boolean;
}

@Injectable()
export class InMemoryPaymentsRepository extends PaymentsRepository {
  private readonly adapter: MockPaymentAdapter = createMockPaymentAdapter();

  override async createCheckout(
    tenantId: string,
    input: { amount: number; currency: string; idempotencyKey: string },
  ): Promise<PaymentSession> {
    return this.adapter.createCheckout({ ...input, tenantId });
  }

  override async getSession(
    tenantId: string,
    externalId: string,
  ): Promise<PaymentSession | null> {
    return this.adapter.getSession(tenantId, externalId);
  }

  override async listSessions(tenantId: string): Promise<PaymentSession[]> {
    return this.adapter.listSessions(tenantId);
  }

  override async applyWebhook(
    raw: Uint8Array,
    signature: string | undefined,
  ): Promise<{
    event: { externalId: string; status: PaymentStatus; tenantId: string } | null;
    verified: boolean;
  }> {
    // Same shared verifier the database-backed repository uses, so the two paths
    // cannot drift on what counts as a trusted webhook.
    const { payload, verified } = verifyMockPaymentWebhookSignature(
      raw,
      signature,
    );
    if (!verified || !payload) {
      return { event: null, verified: false };
    }

    const current = await this.adapter.getSession(
      payload.tenantId,
      payload.externalId,
    );
    if (!current) {
      return { event: null, verified: false };
    }

    const decision = decidePaymentTransition({
      current: current.status,
      next: payload.status,
    });
    if (decision.kind === 'IGNORE') {
      // Report the state that stands, not the one the provider claimed.
      return {
        event: {
          externalId: current.externalId,
          status: current.status,
          tenantId: current.tenantId,
        },
        verified: true,
      };
    }

    const settled = this.adapter.settle(payload.externalId, payload.status);
    return {
      event: {
        externalId: payload.externalId,
        status: settled?.status ?? current.status,
        tenantId: payload.tenantId,
      },
      verified: true,
    };
  }

  override setKillSwitch(enabled: boolean): void {
    this.adapter.setKillSwitch(enabled);
  }

  override isKillSwitchOn(): boolean {
    return this.adapter.isKillSwitchOn();
  }

  /** test helper */
  settle(externalId: string, status: PaymentStatus): PaymentSession | null {
    return this.adapter.settle(externalId, status);
  }
}
