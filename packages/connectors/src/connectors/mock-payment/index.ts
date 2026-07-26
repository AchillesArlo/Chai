import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'EXPIRED'
  | 'FAILED'
  | 'UNKNOWN_RESULT';

export interface CreateCheckoutInput {
  amount: number;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  tenantId: string;
}

export interface PaymentSession {
  amount: number;
  checkoutUrl: string;
  currency: string;
  expiresAt: Date;
  externalId: string;
  status: PaymentStatus;
  tenantId: string;
}

export interface PaymentWebhookEvent {
  externalId: string;
  providerEventId: string;
  status: PaymentStatus;
  tenantId: string;
}

/**
 * Shared secret for the mock provider's webhook signature.
 *
 * The mock is a stand-in for a PSP, but its verification is real HMAC with a
 * constant-time compare: a static string equality would let a forged webhook
 * through and would not exercise the code path that matters (10_SECURITY §9).
 */
function webhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.MOCK_PAYMENT_WEBHOOK_SECRET ?? 'mock-payment-webhook-secret';
}

/** Signature a caller must send in `x-payment-signature`. */
export function signMockPaymentWebhook(
  raw: Uint8Array | string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const body = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : Buffer.from(raw);
  return createHmac('sha256', webhookSecret(env)).update(body).digest('hex');
}

function signatureMatches(raw: Uint8Array, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signMockPaymentWebhook(raw), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  // Length check first: timingSafeEqual throws on mismatched lengths.
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export interface VerifiedPaymentWebhook {
  externalId: string;
  providerEventId: string;
  status: PaymentStatus;
  tenantId: string;
}

/**
 * Verifies a webhook signature and parses the payload, without touching any
 * session state.
 *
 * Split out so a database-backed repository can reuse the SAME verification the
 * adapter uses and then resolve the payment from its own store. Duplicating the
 * check in the repository is how the signature ended up being a string compare
 * in the first place (R-06).
 */
export function verifyMockPaymentWebhookSignature(
  raw: Uint8Array,
  signature: string | undefined,
): { payload: VerifiedPaymentWebhook | null; verified: boolean } {
  if (!signatureMatches(raw, signature)) {
    return { payload: null, verified: false };
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(raw)) as {
      externalId?: string;
      providerEventId?: string;
      status?: PaymentStatus;
      tenantId?: string;
    };
    if (!body.externalId || !body.status || !body.tenantId) {
      return { payload: null, verified: false };
    }
    return {
      payload: {
        externalId: body.externalId,
        providerEventId: body.providerEventId ?? randomUUID(),
        status: body.status,
        tenantId: body.tenantId,
      },
      verified: true,
    };
  } catch {
    return { payload: null, verified: false };
  }
}

/**
 * Hosted-checkout mock. Deterministic external ids, verified webhooks, and
 * polling that converges UNKNOWN_RESULT → PAID/EXPIRED without real PSP calls.
 */
export function createMockPaymentAdapter(options?: { killSwitch?: boolean }) {
  const sessions = new Map<string, PaymentSession>();
  const idemIndex = new Map<string, string>();
  let killSwitch = options?.killSwitch ?? false;

  return {
    setKillSwitch(enabled: boolean): void {
      killSwitch = enabled;
    },

    isKillSwitchOn(): boolean {
      return killSwitch;
    },

    async createCheckout(input: CreateCheckoutInput): Promise<PaymentSession> {
      if (killSwitch) {
        throw new Error('PAYMENT_KILL_SWITCH');
      }
      const key = `${input.tenantId}:${input.idempotencyKey}`;
      const existingId = idemIndex.get(key);
      if (existingId) {
        const existing = sessions.get(existingId);
        if (!existing) throw new Error('dangling payment idempotency');
        return existing;
      }
      const externalId = `pay_${createHash('sha256')
        .update(key)
        .digest('hex')
        .slice(0, 16)}`;
      const session: PaymentSession = {
        amount: input.amount,
        checkoutUrl: `https://pay.mock.local/checkout/${externalId}`,
        currency: input.currency,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        externalId,
        status: 'PENDING',
        tenantId: input.tenantId,
      };
      sessions.set(externalId, session);
      idemIndex.set(key, externalId);
      return session;
    },

    async getSession(tenantId: string, externalId: string): Promise<PaymentSession | null> {
      const session = sessions.get(externalId);
      if (!session || session.tenantId !== tenantId) return null;
      if (session.status === 'PENDING' && session.expiresAt <= new Date()) {
        session.status = 'EXPIRED';
      }
      return { ...session };
    },

    /** Sessions owned by the tenant. Applies the same lazy expiry as getSession
     * so a listed PENDING session past its window reads EXPIRED consistently. */
    listSessions(tenantId: string): PaymentSession[] {
      const owned: PaymentSession[] = [];
      for (const session of sessions.values()) {
        if (session.tenantId !== tenantId) continue;
        if (session.status === 'PENDING' && session.expiresAt <= new Date()) {
          session.status = 'EXPIRED';
        }
        owned.push({ ...session });
      }
      return owned;
    },

    /**
     * Provider-side force outcome (test helper / reconciliation).
     * Stop-on-paid: once PAID, further transitions are ignored.
     */
    settle(externalId: string, status: PaymentStatus): PaymentSession | null {
      const session = sessions.get(externalId);
      if (!session) return null;
      if (session.status === 'PAID') return { ...session };
      session.status = status;
      return { ...session };
    },

    verifyWebhook(
      raw: Uint8Array,
      signature: string | undefined,
    ): { event: PaymentWebhookEvent | null; verified: boolean } {
      const { payload, verified } = verifyMockPaymentWebhookSignature(
        raw,
        signature,
      );
      if (!verified || !payload) {
        return { event: null, verified: false };
      }
      const session = sessions.get(payload.externalId);
      if (!session || session.tenantId !== payload.tenantId) {
        return { event: null, verified: false };
      }
      // Stop-on-paid: a verified webhook still cannot undo a settled payment.
      if (session.status !== 'PAID') {
        session.status = payload.status;
      }
      return {
        event: {
          externalId: payload.externalId,
          providerEventId: payload.providerEventId,
          status: session.status,
          tenantId: payload.tenantId,
        },
        verified: true,
      };
    },
  };
}

export type MockPaymentAdapter = ReturnType<typeof createMockPaymentAdapter>;
