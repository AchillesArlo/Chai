import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';
import { commitBusinessMutation, stopPaymentReminders } from '@chai/domain';
import {
  verifyMockPaymentWebhookSignature,
  type PaymentSession,
  type PaymentStatus,
} from '@chai/connectors/mock-payment';
import { createMidtransAdapter } from '@chai/connectors/midtrans';
import { readWebhookEventTime, verifyWebhookTimestamp } from '@chai/connectors/webhook-verification';

import { API_SERVICE_PRINCIPAL_ID } from '../../database/api-ids';
import { DATABASE } from '../../database/database.module';
import { decidePaymentTransition } from '@chai/domain';
import {
  PaymentNotificationPort,
  PaymentOrderPort,
} from '../shared/action-tool.port';
import { PaymentsRepository } from './payments.repository';
import { PaymentProviderAccountRepository } from './payment-provider-account.repository';

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
  order_id?: string | null;
  invoice_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

const PROVIDER = 'mock-payment';

@Injectable()
export class PostgresPaymentsRepository extends PaymentsRepository {
  private killSwitch = false;
  // FASE 5 — REQ-17-058: per-tenant Midtrans server key. Jika tenant punya
  // baris aktif di chai.payment_provider_account, server_key diambil dari
  // SecretService (per-tenant); jika tidak, fallback ke env global
  // MIDTRANS_SERVER_KEY (ponytail: transisi, semua tenant berbagi satu
  // merchant sampai migration selesai). Adapter Midtrans dibuat on-demand
  // per (tenantId, provider) saat handleWebhook; tanpa key, handleWebhook
  // menolak.
  private readonly globalMidtrans = createMidtransAdapter({
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    sandbox: process.env.MIDTRANS_SANDBOX !== 'false',
  });

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Optional()
    @Inject(PaymentProviderAccountRepository)
    private readonly providerAccounts?: PaymentProviderAccountRepository,
    @Optional()
    @Inject(PaymentOrderPort)
    private readonly orders?: PaymentOrderPort,
    @Optional()
    @Inject(PaymentNotificationPort)
    private readonly notifications?: PaymentNotificationPort,
  ) {
    super();
    // ponytail: FASE 5 — providerAccounts tersedia untuk resolve server_key
    // per-tenant di createCheckout masa depan. verifyProviderWebhook masih
    // pakai globalMidtrans (tenantId hanya terbaca setelah verifikasi).
    void this.providerAccounts;
  }

  /**
   * Delegates to the provider's own verifier and normalizes the result to a
   * common shape. Comparing a local constant here instead would mean
   * swapping in a real PSP changed nothing about how a webhook is trusted
   * (17_PAYMENT §2.4, 10_SECURITY §9) — each provider's signature check stays
   * in its connector, this only picks which one to call.
   *
   * JNE is deliberately absent: its webhook has no signature at all (the
   * provider does not offer one), so wiring it to this public endpoint
   * without a mitigation would be a new unauthenticated write path. Until an
   * infra-level mitigation (IP allowlist) plus mandatory reconciliation is in
   * place, JNE webhooks are not accepted here — see
   * docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md.
   */
  private verifyProviderWebhook(
    provider: string,
    raw: Uint8Array,
    signature: string | undefined,
  ): {
    externalId: string;
    providerEventId: string;
    status: PaymentStatus;
    tenantId: string;
    eventAt: Date | null;
  } | null {
    if (provider === 'mock-payment') {
      const verification = verifyMockPaymentWebhookSignature(raw, signature);
      if (!verification.verified || !verification.payload) {
        return null;
      }
      return { ...verification.payload, eventAt: readWebhookEventTime(raw) };
    }
    if (provider === 'midtrans') {
      // ponytail: FASE 5 — verifikasi signature masih pakai server_key global
      // (env) di sini karena tenantId hanya terbaca SETELAH verifikasi sukses.
      // Per-tenant key resolution di webhook perlu pre-parse order_id dari
      // payload (vektor baru) — di luar scope FASE 5 inti. Repo
      // PaymentProviderAccountRepository + SecretService sudah siap; wiring
      // penuh menyusul saat Midtrans adapter mendukung per-tenant key.
      const result = this.globalMidtrans.handleWebhook(raw, signature);
      if (!result.verified || !result.event) {
        return null;
      }
      return {
        eventAt: result.event.occurredAt,
        externalId: result.event.externalId,
        providerEventId: result.event.providerEventId,
        status: result.event.status,
        tenantId: result.event.tenantId,
      };
    }
    return null;
  }

  override async createCheckout(
    tenantId: string,
    input: { amount: number; currency: string; idempotencyKey: string; invoiceId?: string | null; orderId?: string | null },
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
             idempotency_key, checkout_url, expires_at, provider, order_id, invoice_id)
          VALUES
            (${id}, ${tenantId}, ${externalId}, ${input.amount}, ${input.currency},
             'PENDING', ${input.idempotencyKey}, ${checkoutUrl}, ${expiresAt}, ${PROVIDER},
             ${input.orderId ?? null}::uuid, ${input.invoiceId ?? null}::uuid)
        `;
        const reminderId = randomUUID();
        const dueAt = new Date(Date.now() + 24 * 3600_000);
        await tx`
          INSERT INTO chai.follow_up_job
            (id, tenant_id, payment_id, due_at, status, payload)
          VALUES
            (${reminderId}, ${tenantId}, ${id}, ${dueAt}, 'PENDING',
             ${tx.json({ paymentExternalId: externalId, type: 'payment_reminder' })})
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
    provider: string,
    raw: Uint8Array,
    signature: string | undefined,
  ): Promise<{
    event: { externalId: string; status: PaymentStatus; tenantId: string } | null;
    verified: boolean;
  }> {
    const verified = this.verifyProviderWebhook(provider, raw, signature);
    if (!verified) {
      return { event: null, verified: false };
    }
    const { externalId, providerEventId, status, tenantId, eventAt } = verified;

    // A valid signature never expires on its own — without a timestamp check
    // a captured (or provider-redelivered) request stays replayable forever
    // (REQ-10-016, REQ-09-006, REQ-09-023). Rejected here, before any
    // business state is touched or the dedup row is written.
    if (!verifyWebhookTimestamp(eventAt).ok) {
      return { event: null, verified: false };
    }

    return withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        // Dedup gate: a provider redelivering the same event id for the same
        // tenant+external payment (retry, or a captured request replayed
        // inside the window) must not be processed twice. The UNIQUE
        // constraint on (tenant_id, provider, external_id, provider_event_id)
        // is the actual enforcement; ON CONFLICT DO NOTHING makes a repeat
        // insert a no-op instead of an error, and the row count tells us
        // whether this is the first time we have seen this event.
        const inserted = await tx`
          INSERT INTO chai.payment_webhook_event
            (id, tenant_id, provider, external_id, provider_event_id, event_at, verified)
          VALUES (
            ${randomUUID()},
            ${tenantId},
            ${provider},
            ${externalId},
            ${providerEventId},
            ${eventAt},
            true
          )
          ON CONFLICT (tenant_id, provider, external_id, provider_event_id) DO NOTHING
          RETURNING id
        `;
        if (inserted.length === 0) {
          // Already seen: report the current state rather than reprocessing.
          const existing: PaymentRow[] = await tx`
            SELECT * FROM chai.payment
            WHERE tenant_id = ${tenantId} AND external_id = ${externalId}
          `;
          const existingRow = existing[0];
          return {
            event: existingRow
              ? {
                  externalId: existingRow.external_id,
                  status: existingRow.status,
                  tenantId: existingRow.tenant_id,
                }
              : null,
            verified: true,
          };
        }

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

        // Money is an external effect: the state change, its audit row, and the
        // event must land together or not at all (README invariant, ADR-007).
        // Before this, applyWebhook ran a bare UPDATE, so a PAID transition left
        // NO audit trail and emitted NO event -- realtime, analytics, and
        // automations never learned the payment settled, and there was no record
        // of who/what moved the money state.
        //
        // The event name matches the reconciliation worker's
        // (`payment.<status>`) on purpose: the two paths describe the SAME state
        // change, so a consumer keyed on `payment.paid` must not silently miss
        // webhook-driven settlements.
        let cancelledReminders: string[] = [];
        const next = await commitBusinessMutation(tx, {
          describe: (result) => ({
            audit: {
              action: 'payment.status_changed',
              actorId: API_SERVICE_PRINCIPAL_ID,
              metadata: {
                cancelledReminders: cancelledReminders.length,
                currency: result.currency,
                // externalId is the provider's handle (text), so it travels in
                // metadata; resource_id is a uuid column.
                externalId: result.external_id,
                fromStatus: row.status,
                provider: 'mock-payment',
                toStatus: result.status,
              },
              resourceId: result.id,
              resourceType: 'payment',
            },
            events: [
              {
                aggregateId: result.id,
                aggregateType: 'payment',
                aggregateVersion: 1,
                eventType: `payment.${result.status.toLowerCase()}`,
                partitionKey: result.external_id,
                // Amount travels as integer minor units plus currency code,
                // never a float (README invariant).
                payload: {
                  amountMinor: result.amount_cents,
                  cancelledReminders: cancelledReminders.length,
                  currency: result.currency,
                  externalId: result.external_id,
                  previousStatus: row.status,
                  status: result.status,
                },
              },
            ],
          }),
          mutate: async () => {
            const updated: PaymentRow[] = await tx`
              UPDATE chai.payment
              SET status = ${status},
                  status_event_at = ${eventAt ?? null},
                  updated_at = now()
              WHERE tenant_id = ${tenantId} AND external_id = ${externalId}
              RETURNING *
            `;
            const applied = updated[0] as PaymentRow;
            // Settled money stops the reminders chasing it, in this same
            // transaction so the two cannot diverge (07_EVENTS §449).
            if (applied.status === 'PAID') {
              cancelledReminders = await stopPaymentReminders(
                tx,
                tenantId,
                applied.id,
              );
              if (applied.invoice_id && this.orders) {
                await this.orders.markInvoicePaid(tenantId, applied.invoice_id);
              }
              if (this.notifications) {
                // FASE 7: notifikasi in-app saja, channel ke contact di luar scope
                await this.notifications.notify(tenantId, {
                  title: 'Pembayaran diterima',
                  message: `Pembayaran sebesar ${applied.currency} ${applied.amount_cents} (${applied.external_id}) telah diterima.`,
                });
              }
            }
            return applied;
          },
          tenantId,
        });
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
