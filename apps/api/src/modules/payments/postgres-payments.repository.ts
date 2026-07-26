import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';
import {
  verifyMockPaymentWebhookSignature,
  type PaymentSession,
  type PaymentStatus,
} from '@chai/connectors/mock-payment';

import { API_SERVICE_PRINCIPAL_ID } from '../../database/api-ids';
import { DATABASE } from '../../database/database.module';
import { decidePaymentTransition } from '@chai/domain';
import { PaymentsRepository } from './payments.repository';

interface PaymentRow {
  id: string;
  tenant_id: string;
  external_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  status_event_at: Date | null;
  idempotency_key: string | null;
  checkout_url: string;
  expires_at: Date;
  provider: string;
  created_at: Date;
  updated_at: Date;
}

const PROVIDER = 'mock-payment';

/** Provider event time, when the payload carries one. */
function readEventTime(raw: Uint8Array): Date | null {
  try {
    const body = JSON.parse(Buffer.from(raw).toString('utf8')) as {
      eventAt?: string;
      occurredAt?: string;
    };
    const value = body.eventAt ?? body.occurredAt;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

@Injectable()
export class PostgresPaymentsRepository extends PaymentsRepository {
  private killSwitch = false;

  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async createCheckout(
    tenantId: string,
    input: { amount: number; currency: string; idempotencyKey: string },
  ): Promise<PaymentSession> {
    if (this.killSwitch) {
      throw new Error('PAYMENT_KILL_SWITCH');
    }
    const externalId = `pay_${createHash('sha256')
      .update(`${tenantId}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 16)}`;
    const checkoutUrl = `https://pay.mock.local/checkout/${externalId}`;
    const expiresAt = new Date(Date.now() + 30 * 60_000);

    return withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const existing: PaymentRow[] = await tx`
          SELECT * FROM chai.payment
          WHERE tenant_id = ${tenantId}
            AND idempotency_key = ${input.idempotencyKey}
        `;
        if (existing.length > 0) {
          return this.mapRow(existing[0] as PaymentRow);
        }
        const id = randomUUID();
        await tx`
          INSERT INTO chai.payment
            (id, tenant_id, external_id, amount_cents, currency, status,
             idempotency_key, checkout_url, expires_at, provider)
          VALUES
            (${id}, ${tenantId}, ${externalId}, ${input.amount}, ${input.currency},
             'PENDING', ${input.idempotencyKey}, ${checkoutUrl}, ${expiresAt}, ${PROVIDER})
        `;
        return {
          amount: input.amount,
          checkoutUrl,
          currency: input.currency,
          expiresAt,
          externalId,
          status: 'PENDING',
          tenantId,
        };
      },
    );
  }

  override async getSession(
    tenantId: string,
    externalId: string,
  ): Promise<PaymentSession | null> {
    return withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows: PaymentRow[] = await tx`
          SELECT * FROM chai.payment
          WHERE tenant_id = ${tenantId} AND external_id = ${externalId}
        `;
        return rows.length > 0 ? this.mapRow(rows[0] as PaymentRow) : null;
      },
    );
  }

  override async listSessions(tenantId: string): Promise<PaymentSession[]> {
    return withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows: PaymentRow[] = await tx`
          SELECT * FROM chai.payment
          WHERE tenant_id = ${tenantId}
          ORDER BY created_at DESC
          LIMIT 100
        `;
        return rows.map((row) => this.mapRow(row as PaymentRow));
      },
    );
  }

  override async applyWebhook(
    raw: Uint8Array,
    signature: string | undefined,
  ): Promise<{
    event: { externalId: string; status: PaymentStatus; tenantId: string } | null;
    verified: boolean;
  }> {
    // Verification is delegated to the provider's shared verifier. Comparing a
    // local constant here would mean swapping in a real PSP changed nothing
    // about how a webhook is trusted (17_PAYMENT §2.4, 10_SECURITY §9).
    const verification = verifyMockPaymentWebhookSignature(raw, signature);
    if (!verification.verified || !verification.payload) {
      return { event: null, verified: false };
    }
    const { externalId, status, tenantId } = verification.payload;
    const eventAt = readEventTime(raw);

    return withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const current: PaymentRow[] = await tx`
          SELECT * FROM chai.payment
          WHERE tenant_id = ${tenantId} AND external_id = ${externalId}
          FOR UPDATE
        `;
        const row = current[0];
        if (!row) {
          return { event: null, verified: false };
        }

        const decision = decidePaymentTransition({
          current: row.status,
          eventAt,
          next: status,
          observedAt: row.status_event_at ?? null,
        });
        if (decision.kind === 'IGNORE') {
          // Duplicate, stale, or a downgrade of a terminal state: report the
          // state that stands rather than the state the provider claimed.
          return {
            event: {
              externalId: row.external_id,
              status: row.status,
              tenantId: row.tenant_id,
            },
            verified: true,
          };
        }

        const updated: PaymentRow[] = await tx`
          UPDATE chai.payment
          SET status = ${status},
              status_event_at = ${eventAt ?? null},
              updated_at = now()
          WHERE tenant_id = ${tenantId} AND external_id = ${externalId}
          RETURNING *
        `;
        const next = updated[0] as PaymentRow;
        return {
          event: {
            externalId: next.external_id,
            status: next.status,
            tenantId: next.tenant_id,
          },
          verified: true,
        };
      },
    );
  }

  override setKillSwitch(enabled: boolean): void {
    this.killSwitch = enabled;
  }

  override isKillSwitchOn(): boolean {
    return this.killSwitch;
  }

  private mapRow(row: PaymentRow): PaymentSession {
    return {
      amount: row.amount_cents,
      checkoutUrl: row.checkout_url,
      currency: row.currency,
      expiresAt: row.expires_at,
      externalId: row.external_id,
      status: row.status,
      tenantId: row.tenant_id,
    };
  }
}
