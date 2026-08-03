import { Injectable } from '@nestjs/common';

import {
  createMockPaymentAdapter,
  verifyMockPaymentWebhookSignature,
  type MockPaymentAdapter,
  type PaymentSession,
  type PaymentStatus,
} from '@chai/connectors/mock-payment';
import { readWebhookEventTime, verifyWebhookTimestamp } from '@chai/connectors/webhook-verification';

import { decidePaymentTransition } from '@chai/domain';

export abstract class PaymentsRepository {
  abstract createCheckout(
    tenantId: string,
    input: {
      amount: number;
      currency: string;
      idempotencyKey: string;
      invoiceId?: string | null;
      orderId?: string | null;
    },
  ): Promise<PaymentSession>;

  abstract getSession(
    tenantId: string,
    externalId: string,
  ): Promise<PaymentSession | null>;

  abstract listSessions(tenantId: string): Promise<PaymentSession[]>;

  abstract applyWebhook(
    provider: string,
    raw: Uint8Array,
    signature: string | undefined,
  ): Promise<{ event: { externalId: string; status: PaymentStatus; tenantId: string } | null; verified: boolean }>;

  abstract setKillSwitch(enabled: boolean): void;

  abstract isKillSwitchOn(): boolean;
}

@Injectable()
export class InMemoryPaymentsRepository extends PaymentsRepository {
  private readonly adapter: MockPaymentAdapter = createMockPaymentAdapter();
  // ponytail: in-memory dedup set, not a durable table — same gap the
  // Postgres path closed with chai.payment_webhook_event (migration 0084).
  // Fine for local/e2e since this repository's whole lifetime is one process.
  private readonly seenEvents = new Set<string>();

  override async createCheckout(
    tenantId: string,
    input: { amount: number; currency: string; idempotencyKey: string; invoiceId?: string | null; orderId?: string | null },
  ): Promise<PaymentSession> {
    return this.adapter.createCheckout({
      amount: input.amount,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      tenantId,
    });
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
    provider: string,
    raw: Uint8Array,
    signature: string | undefined,
  ): Promise<{
    event: { externalId: string; status: PaymentStatus; tenantId: string } | null;
    verified: boolean;
  }> {
    if (provider !== 'mock-payment') {
      // The in-memory repository only backs the mock provider (local/test);
      // Midtrans is only wired for the Postgres-backed repository.
      return { event: null, verified: false };
    }
    // Same shared verifier the database-backed repository uses, so the two paths
    // cannot drift on what counts as a trusted webhook.
    const { payload, verified } = verifyMockPaymentWebhookSignature(
      raw,
      signature,
    );
    if (!verified || !payload) {
      return { event: null, verified: false };
    }

    // Same timestamp gate the Postgres path applies (REQ-10-016/REQ-09-006/
    // REQ-09-023): a signature never expires on its own.
    const eventAt = readWebhookEventTime(raw);
    if (!verifyWebhookTimestamp(eventAt).ok) {
      return { event: null, verified: false };
    }

    // Same dedup-by-event-id gate the Postgres path applies via
    // chai.payment_webhook_event: a repeat of the same provider event id is
    // a replay (or a benign retry), not a fresh event.
    const dedupKey = `${payload.tenantId}:${provider}:${payload.externalId}:${payload.providerEventId}`;
    if (this.seenEvents.has(dedupKey)) {
      const current = await this.adapter.getSession(payload.tenantId, payload.externalId);
      return {
        event: current
          ? { externalId: current.externalId, status: current.status, tenantId: current.tenantId }
          : null,
        verified: true,
      };
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
    this.seenEvents.add(dedupKey);
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
