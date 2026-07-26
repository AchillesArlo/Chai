import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
  type TenantContext,
} from '@chai/database';
import {
  commitBusinessMutation,
  decidePaymentTransition,
  isTerminalPaymentStatus,
  type PaymentStatus,
} from '@chai/domain';

/**
 * Payment reconciliation worker.
 *
 * The blueprint requires every external effect to be reconcilable (ADR-007):
 * a provider may accept a payment while the acknowledgement is lost, so the
 * platform cannot trust that a webhook always arrives. This worker polls the
 * provider for every non-terminal session and converges the local state through
 * the SAME transition machine the API uses, so `PAID` never regresses and a
 * result the platform cannot classify parks at `UNKNOWN_RESULT` instead of
 * being guessed into a terminal state.
 */

const PAYMENT_STATUSES = new Set<string>([
  'CREATED',
  'PENDING',
  'PAID',
  'EXPIRED',
  'FAILED',
  'UNKNOWN_RESULT',
]);

/**
 * Maps a provider-reported status onto the canonical vocabulary, failing SAFE.
 *
 * An unrecognised value becomes `UNKNOWN_RESULT` — an execution state that keeps
 * the session open for the next pass — never a guessed terminal status. The
 * platform must never decide money moved because it could not read the code
 * (17_PAYMENT §6.2, GAP-015).
 */
export function canonicalPaymentStatus(raw: string): PaymentStatus {
  return PAYMENT_STATUSES.has(raw) ? (raw as PaymentStatus) : 'UNKNOWN_RESULT';
}

/** One provider observation for a checkout. */
export interface ProviderPaymentStatus {
  /** Provider event time, when supplied; used for precedence. */
  eventAt?: Date | null;
  /** Raw provider status. Canonicalised by the worker; unknown → UNKNOWN_RESULT. */
  status: string;
}

/**
 * The provider poll, inverted so the loop never depends on a concrete connector
 * and can be exercised against a real database with a fake provider in tests.
 */
export interface PaymentProviderPort {
  fetchStatus(
    tenantId: string,
    externalId: string,
  ): Promise<ProviderPaymentStatus | null>;
}

export interface PaymentReconcilerOptions {
  /** Max sessions polled per tenant per pass. */
  batchLimit: number;
  /** Idle sleep between passes when nothing changed. */
  pollIntervalMs: number;
}

type TenantRunner = <T>(
  database: Database,
  context: TenantContext,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
) => Promise<T>;

export interface PaymentReconcilerConfig {
  database: Database;
  /** Bounded pass count for tests; unbounded in production. */
  iterations?: number;
  options: PaymentReconcilerOptions;
  provider: PaymentProviderPort;
  /** Overridable for tests; defaults to the RLS-scoped tenant transaction. */
  runInTenant?: TenantRunner;
  signal?: AbortSignal;
  tenants: readonly TenantContext[];
}

/**
 * Legacy pure helper: reports a provider status and whether it is terminal.
 * Kept for callers that only need a terminal check; the terminal rule is shared
 * with the transition machine so the two cannot drift.
 */
export async function pollAndReconcile(
  adapter: {
    getSession: (
      tenantId: string,
      externalId: string,
    ) => Promise<{ status: PaymentStatus } | null>;
  },
  tenantId: string,
  externalId: string,
): Promise<{ status: PaymentStatus; terminal: boolean } | null> {
  const session = await adapter.getSession(tenantId, externalId);
  if (!session) return null;
  return {
    status: session.status,
    terminal: isTerminalPaymentStatus(session.status),
  };
}

interface PendingPaymentRow {
  external_id: string;
}

async function selectNonTerminalPayments(
  transaction: DatabaseTransaction,
  tenantId: string,
  limit: number,
): Promise<string[]> {
  // Terminal sessions (PAID/EXPIRED/FAILED) are excluded: nothing a provider
  // reports may reopen them, so there is no reason to poll them.
  const rows = await transaction<PendingPaymentRow[]>`
    SELECT external_id
    FROM chai.payment
    WHERE tenant_id = ${tenantId}
      AND status IN ('CREATED', 'PENDING', 'UNKNOWN_RESULT')
    ORDER BY created_at ASC
    LIMIT ${Math.max(1, Math.trunc(limit))}::int
  `;
  return rows.map((row) => row.external_id);
}

interface LockedPaymentRow {
  amount_cents: number;
  currency: string;
  external_id: string;
  id: string;
  status: PaymentStatus;
  status_event_at: Date | null;
}

/**
 * Coarse lifecycle stage, used as the outbox aggregate version so a consumer
 * observes a monotonic sequence per payment. `chai.payment` has no version
 * column; the partition key (external id) still orders events by insertion.
 * ponytail: coarse ordinal, not a per-row counter — enough for partition-scoped
 * ordering, and there is at most one meaningful transition per payment.
 */
function paymentStatusStage(status: PaymentStatus): number {
  switch (status) {
    case 'CREATED':
      return 0;
    case 'PENDING':
      return 1;
    case 'UNKNOWN_RESULT':
      return 2;
    case 'PAID':
    case 'EXPIRED':
    case 'FAILED':
      return 3;
  }
}

/**
 * Applies one reconciliation decision inside a single tenant-scoped
 * transaction: the row is re-read `FOR UPDATE`, the shared transition machine
 * decides, and — only when it says APPLY — the status change, the audit entry,
 * and the outbox event are committed together (ADR-007). If the machine says
 * IGNORE (duplicate, stale event, or a downgrade of a terminal state) nothing
 * is written, so a redelivered PENDING can never undo a PAID.
 */
async function applyReconciliation(
  transaction: DatabaseTransaction,
  tenant: TenantContext,
  externalId: string,
  next: PaymentStatus,
  eventAt: Date | null,
): Promise<boolean> {
  const rows = await transaction<LockedPaymentRow[]>`
    SELECT id, external_id, status, status_event_at, amount_cents, currency
    FROM chai.payment
    WHERE tenant_id = ${tenant.tenantId} AND external_id = ${externalId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) return false;

  const decision = decidePaymentTransition({
    current: row.status,
    eventAt,
    next,
    observedAt: row.status_event_at ?? null,
  });
  if (decision.kind !== 'APPLY') return false;

  await commitBusinessMutation(transaction, {
    describe: (result) => ({
      audit: {
        action: 'payment.reconcile',
        actorId: tenant.principalId,
        metadata: {
          externalId: result.external_id,
          previousStatus: row.status,
          status: result.status,
        },
        reason: `reconciled to ${result.status}`,
        resourceId: result.id,
        resourceType: 'payment',
      },
      events: [
        {
          aggregateId: result.id,
          aggregateType: 'payment',
          aggregateVersion: paymentStatusStage(result.status),
          eventType: `payment.${result.status.toLowerCase()}`,
          partitionKey: result.external_id,
          payload: {
            amountCents: result.amount_cents,
            currency: result.currency,
            externalId: result.external_id,
            previousStatus: row.status,
            status: result.status,
          },
        },
      ],
    }),
    mutate: async () => {
      const updated = await transaction<LockedPaymentRow[]>`
        UPDATE chai.payment
        SET status = ${next},
            status_event_at = ${eventAt},
            updated_at = now()
        WHERE id = ${row.id}
        RETURNING id, external_id, status, status_event_at, amount_cents, currency
      `;
      return updated[0] as LockedPaymentRow;
    },
    tenantId: tenant.tenantId,
  });
  return true;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Polls the provider for every non-terminal session per tenant and converges
 * local state. The provider call happens outside the transaction so no row lock
 * is held across a network round-trip; the decision and the write then run
 * inside one tenant-scoped transaction that re-reads the row under lock.
 */
export async function runPaymentReconciler(
  config: PaymentReconcilerConfig,
): Promise<void> {
  const { database, options, provider, signal, tenants } = config;
  const runInTenant = config.runInTenant ?? withTenantTransaction;
  const maxIterations = config.iterations;

  let iteration = 0;
  while (
    !signal?.aborted &&
    (maxIterations === undefined || iteration < maxIterations)
  ) {
    iteration += 1;
    let didWork = false;

    for (const tenant of tenants) {
      if (signal?.aborted) break;
      const externalIds = await runInTenant(database, tenant, (transaction) =>
        selectNonTerminalPayments(transaction, tenant.tenantId, options.batchLimit),
      );

      for (const externalId of externalIds) {
        if (signal?.aborted) break;
        const observed = await provider.fetchStatus(tenant.tenantId, externalId);
        if (!observed) continue; // provider unreachable — retry next pass

        const next = canonicalPaymentStatus(observed.status);
        const applied = await runInTenant(database, tenant, (transaction) =>
          applyReconciliation(
            transaction,
            tenant,
            externalId,
            next,
            observed.eventAt ?? null,
          ),
        );
        if (applied) didWork = true;
      }
    }

    if (!didWork && (maxIterations === undefined || iteration < maxIterations)) {
      await sleep(options.pollIntervalMs, signal);
    }
  }
}
