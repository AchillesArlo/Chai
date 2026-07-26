import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { createMockPaymentAdapter } from '../mock-payment/index.js';

export type { PaymentStatus } from '../mock-payment/index.js';

import type { PaymentSession, PaymentStatus } from '../mock-payment/index.js';

export interface MidtransTransactionDetails {
  amount: number;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  tenantId: string;
}

export interface MidtransSession extends PaymentSession {
  idempotencyKey?: string;
  metadata?: Record<string, string>;
  provider: 'midtrans';
  providerToken?: string;
  redirectUrl?: string;
}

export interface MidtransWebhookEvent {
  externalId: string;
  occurredAt: Date;
  provider: 'midtrans';
  providerEventId: string;
  receivedAt: Date;
  status: PaymentStatus;
  tenantId: string;
}

export interface MidtransWebhookResult {
  event: MidtransWebhookEvent | null;
  verified: boolean;
}

/**
 * S4-1: refund request payload. `reason` is required by Midtrans; amounts are
 * in the same major currency units as the original charge.
 */
export interface MidtransRefundInput {
  amount: number;
  externalId: string;
  idempotencyKey: string;
  reason: string;
  tenantId: string;
}

export interface MidtransRefundResult {
  externalId: string;
  providerRef: string;
  reason: string;
  refundAmount: number;
  status: 'pending' | 'completed' | 'failed';
  tenantId: string;
}

/**
 * S4-1: settlement line item mirrored from Midtrans settlement reports.
 * ponytail: flat shape covers the reconciliation dashboard; add fields only if
 * the finance team asks for them.
 */
export interface MidtransSettlementRecord {
  externalId: string;
  feeAmount: number;
  grossAmount: number;
  netAmount: number;
  provider: 'midtrans';
  settlementRef: string;
  settledAt: Date;
  tenantId: string;
}

export interface MidtransAdapterOptions {
  clientKey?: string;
  fetch?: typeof globalThis.fetch;
  sandbox?: boolean;
  serverKey?: string;
  snapBaseUrl?: string;
  statusBaseUrl?: string;
}

const DEFAULT_SANDBOX_SNAP = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const DEFAULT_SANDBOX_STATUS = 'https://api.sandbox.midtrans.com/v2';
const DEFAULT_PRODUCTION_SNAP = 'https://app.midtrans.com/snap/v1/transactions';
const DEFAULT_PRODUCTION_STATUS = 'https://api.midtrans.com/v2';

type FetchLike = typeof globalThis.fetch;

function basicAuthHeader(serverKey: string): string {
  return 'Basic ' + Buffer.from(`${serverKey}:`).toString('base64');
}

function mapTransactionStatus(raw: string | undefined): PaymentStatus {
  switch (raw) {
    case 'capture':
    case 'settlement':
      return 'PAID';
    case 'pending':
    case 'authorize':
      return 'PENDING';
    case 'expire':
      return 'EXPIRED';
    case 'cancel':
    case 'deny':
    case 'failure':
      return 'FAILED';
    default:
      return 'UNKNOWN_RESULT';
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function computeSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest('hex');
}

interface SnapCreateResponse {
  error_message?: string;
  redirect_url?: string;
  token?: string;
}

interface StatusApiResponse {
  error_message?: string;
  gross_amount?: string;
  order_id?: string;
  status_code?: string;
  transaction_status?: string;
}

interface MidtransWebhookPayload {
  fraud_status?: string;
  gross_amount?: string;
  order_id?: string;
  status_code?: string;
  transaction_id?: string;
  transaction_status?: string;
  transaction_time?: string;
}

function extractTenantFromOrderId(orderId: string): { externalId: string; tenantId: string } {
  const sep = orderId.indexOf('|');
  if (sep === -1) return { externalId: orderId, tenantId: '' };
  return {
    externalId: orderId.slice(sep + 1),
    tenantId: orderId.slice(0, sep),
  };
}

function buildOrderId(tenantId: string, externalId: string): string {
  return `${tenantId}|${externalId}`;
}

/**
 * Midtrans Snap sandbox adapter. When `serverKey` is absent the adapter falls
 * back to deterministic mock behavior so local dev and CI work without
 * credentials. With a server key present, calls hit the Snap + core status
 * APIs over Basic auth and webhook signatures are SHA-512 verified.
 */
export function createMidtransAdapter(options: MidtransAdapterOptions = {}) {
  const {
    serverKey,
    clientKey,
    sandbox = true,
    fetch: fetchImpl = globalThis.fetch as FetchLike,
    snapBaseUrl,
    statusBaseUrl,
  } = options;

  const snapBase = snapBaseUrl ?? (sandbox ? DEFAULT_SANDBOX_SNAP : DEFAULT_PRODUCTION_SNAP);
  const statusBase = statusBaseUrl ?? (sandbox ? DEFAULT_SANDBOX_STATUS : DEFAULT_PRODUCTION_STATUS);

  const fallback = createMockPaymentAdapter();
  const idemToExternal = new Map<string, string>();
  const liveSessions = new Map<string, MidtransSession>();

  const live = Boolean(serverKey);

  function cacheKey(tenantId: string, externalId: string): string {
    return `${tenantId}:${externalId}`;
  }

  function toSession(
    tenantId: string,
    externalId: string,
    amount: number,
    currency: string,
    idempotencyKey: string,
    metadata: Record<string, string>,
    status: PaymentStatus,
    extras?: { providerToken?: string; redirectUrl?: string },
  ): MidtransSession {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      amount,
      checkoutUrl: extras?.redirectUrl ?? '',
      currency,
      expiresAt,
      externalId,
      idempotencyKey,
      metadata,
      provider: 'midtrans',
      providerToken: extras?.providerToken,
      redirectUrl: extras?.redirectUrl,
      status,
      tenantId,
    };
  }

  return {
    isLive(): boolean {
      return live;
    },

    isSandbox(): boolean {
      return sandbox;
    },

    getClientKey(): string | undefined {
      return clientKey;
    },

    async createCheckoutSession(
      transaction: MidtransTransactionDetails,
    ): Promise<MidtransSession> {
      if (!live) {
        const session = await fallback.createCheckout({
          amount: transaction.amount,
          currency: transaction.currency,
          idempotencyKey: transaction.idempotencyKey,
          metadata: transaction.metadata,
          tenantId: transaction.tenantId,
        });
        return { ...session, provider: 'midtrans' };
      }

      const idemSeen = idemToExternal.get(transaction.idempotencyKey);
      if (idemSeen) {
        return this.getSessionStatus(transaction.tenantId, idemSeen).then((existing) => {
          if (!existing) {
            throw new Error('MIDTRANS_IDEMPOTENCY_MISMATCH');
          }
          return existing;
        });
      }

      const externalId = randomUUID();
      idemToExternal.set(transaction.idempotencyKey, externalId);

      const body = {
        callbacks: { finish: transaction.metadata?.finishUrl },
        credit_card: { secure: true },
        customer_details: {
          email: transaction.metadata?.customerEmail,
          first_name: transaction.metadata?.customerName,
          phone: transaction.metadata?.customerPhone,
        },
        enabled_payments: transaction.metadata?.enabledPayments?.split(',').filter(Boolean),
        item_details: transaction.metadata?.itemDetailsRaw
          ? (JSON.parse(transaction.metadata.itemDetailsRaw) as unknown[])
          : undefined,
        transaction_details: {
          currency: transaction.currency,
          gross_amount: transaction.amount,
          order_id: buildOrderId(transaction.tenantId, externalId),
        },
      };

      const response = await fetchImpl(snapBase, {
        body: JSON.stringify(body),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': transaction.idempotencyKey,
          Authorization: basicAuthHeader(serverKey as string),
        },
        method: 'POST',
      });

      const json = (await response.json()) as SnapCreateResponse;
      if (!response.ok || !json.token) {
        throw new Error(
          `MIDTRANS_CREATE_FAILED: ${response.status} ${json.error_message ?? 'no token'}`,
        );
      }

      const session = toSession(
        transaction.tenantId,
        externalId,
        transaction.amount,
        transaction.currency,
        transaction.idempotencyKey,
        transaction.metadata ?? {},
        'PENDING',
        { providerToken: json.token, redirectUrl: json.redirect_url },
      );
      liveSessions.set(cacheKey(transaction.tenantId, externalId), session);
      return session;
    },

    async getSessionStatus(
      tenantId: string,
      externalId: string,
    ): Promise<MidtransSession | null> {
      if (!live) {
        const session = await fallback.getSession(tenantId, externalId);
        if (!session) return null;
        return { ...session, provider: 'midtrans' };
      }

      const cached = liveSessions.get(cacheKey(tenantId, externalId));
      const orderId = buildOrderId(tenantId, externalId);
      const url = `${statusBase}/${encodeURIComponent(orderId)}/status`;

      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          Authorization: basicAuthHeader(serverKey as string),
        },
        method: 'GET',
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`MIDTRANS_STATUS_FAILED: ${response.status}`);
      }

      const json = (await response.json()) as StatusApiResponse;
      const status = mapTransactionStatus(json.transaction_status);
      if (!cached) {
        const gross = Number.parseFloat(json.gross_amount ?? '0') || 0;
        return toSession(tenantId, externalId, gross, 'IDR', '', {}, status);
      }
      const updated: MidtransSession = { ...cached, status };
      liveSessions.set(cacheKey(tenantId, externalId), updated);
      return updated;
    },

    /**
     * S4-1: issue a refund against a previously captured transaction. In
     * non-live mode the refund is recorded against the mock session so the
     * conformance suite can assert the flow without network access. Idempotent
     * by `idempotencyKey` (Midtrans dedupes server-side via refund_key).
     */
    async issueRefund(input: MidtransRefundInput): Promise<MidtransRefundResult> {
      if (!live) {
        const session = await fallback.getSession(input.tenantId, input.externalId);
        if (!session) {
          throw new Error('MIDTRANS_REFUND_TARGET_NOT_FOUND');
        }
        const providerRef = `refund-${input.idempotencyKey}`;
        return {
          externalId: input.externalId,
          providerRef,
          reason: input.reason,
          refundAmount: input.amount,
          status: 'completed',
          tenantId: input.tenantId,
        };
      }

      const orderId = buildOrderId(input.tenantId, input.externalId);
      const url = `${statusBase}/${encodeURIComponent(orderId)}/refund/online`;
      const response = await fetchImpl(url, {
        body: JSON.stringify({
          reason: input.reason,
          refund_key: input.idempotencyKey,
          amount: input.amount,
        }),
        headers: {
          Accept: 'application/json',
          Authorization: basicAuthHeader(serverKey as string),
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      const json = (await response.json()) as { refund_chargeback_id?: string; status_code?: string };
      if (!response.ok) {
        throw new Error(
          `MIDTRANS_REFUND_FAILED: ${response.status} ${json.status_code ?? 'no status'}`,
        );
      }
      return {
        externalId: input.externalId,
        providerRef: json.refund_chargeback_id ?? input.idempotencyKey,
        reason: input.reason,
        refundAmount: input.amount,
        status: 'pending',
        tenantId: input.tenantId,
      };
    },

    /**
     * S4-1: list settlement records for a tenant. Non-live mode returns an
     * empty list (the reconciliation dashboard renders nothing in tests);
     * live mode calls the Midtrans settlement report endpoint.
     * ponytail: returns all settled transactions for the tenant; add date-range
     * params only when finance asks for windowed reconciliation.
     */
    async listSettlements(tenantId: string): Promise<MidtransSettlementRecord[]> {
      if (!live) {
        return [];
      }

      const url = `${statusBase}/settlement-report`;
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          Authorization: basicAuthHeader(serverKey as string),
        },
        method: 'GET',
      });
      if (!response.ok) {
        throw new Error(`MIDTRANS_SETTLEMENT_FAILED: ${response.status}`);
      }

      const raw = (await response.json()) as Array<{
        gross_amount?: string;
        order_id?: string;
        settlement_time?: string;
        settlement_ref?: string;
        fee_amount?: string;
        net_amount?: string;
      }>;
      return raw
        .map((entry) => {
          const parsed = extractTenantFromOrderId(entry.order_id ?? '');
          if (parsed.tenantId !== tenantId) return null;
          const gross = Number.parseFloat(entry.gross_amount ?? '0') || 0;
          const fee = Number.parseFloat(entry.fee_amount ?? '0') || 0;
          const net = Number.parseFloat(entry.net_amount ?? '0') || gross - fee;
          const settledAt = entry.settlement_time ? new Date(entry.settlement_time) : new Date();
          return {
            externalId: parsed.externalId,
            feeAmount: fee,
            grossAmount: gross,
            netAmount: net,
            provider: 'midtrans' as const,
            settlementRef: entry.settlement_ref ?? parsed.externalId,
            settledAt,
            tenantId: parsed.tenantId,
          };
        })
        .filter((record): record is MidtransSettlementRecord => record !== null);
    },

    handleWebhook(
      raw: Uint8Array | string,
      signatureKey: string | undefined,
    ): MidtransWebhookResult {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);

      let payload: MidtransWebhookPayload;
      try {
        payload = JSON.parse(text) as MidtransWebhookPayload;
      } catch {
        return { event: null, verified: false };
      }

      if (!payload.order_id || !payload.transaction_status) {
        return { event: null, verified: false };
      }

      // Signature verification is unconditional. Previously a sandbox
      // configuration accepted a fixed magic string, which meant an environment
      // without a server key trusted any caller that knew that string
      // (10_SECURITY §9, 17_PAYMENT §2.4). No key configured now means the
      // webhook cannot be verified at all, so it is refused.
      if (!serverKey) {
        return { event: null, verified: false };
      }
      const expected = computeSignature(
        payload.order_id,
        payload.status_code ?? '',
        payload.gross_amount ?? '',
        serverKey,
      );
      if (!signatureKey || !timingSafeStringEqual(expected, signatureKey)) {
        return { event: null, verified: false };
      }

      const { externalId, tenantId } = extractTenantFromOrderId(payload.order_id);
      if (!tenantId) {
        return { event: null, verified: false };
      }

      const occurredAt = payload.transaction_time
        ? new Date(payload.transaction_time)
        : new Date();

      return {
        event: {
          externalId,
          occurredAt,
          provider: 'midtrans',
          providerEventId: payload.transaction_id ?? randomUUID(),
          receivedAt: new Date(),
          status: mapTransactionStatus(payload.transaction_status),
          tenantId,
        },
        verified: true,
      };
    },

    setKillSwitch(enabled: boolean): void {
      fallback.setKillSwitch(enabled);
    },

    isKillSwitchOn(): boolean {
      return fallback.isKillSwitchOn();
    },
  };
}

export type MidtransAdapter = ReturnType<typeof createMidtransAdapter>;
