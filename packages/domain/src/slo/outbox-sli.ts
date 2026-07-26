// Outbox-delivery SLI harvester (blueprint 12 §5, ADR-007/ADR-019).
//
// burn-rate.ts computes and evaluates burn rate, but nothing fed it real
// samples. The only side-effect ledger in this codebase that is guaranteed to
// carry data — every business mutation appends to it in the same transaction
// (see outbox/producer.ts `commitBusinessMutation`) — is `chai.outbox_event`.
// Its terminal states are an honest availability SLI for event publication:
//
//   PUBLISHED    delivery succeeded            -> good
//   DEAD_LETTER  retries exhausted, gave up    -> bad
//   PENDING/PROCESSING/RETRY                    -> in flight, not yet decided
//
// We count only DECIDED events (PUBLISHED + DEAD_LETTER). In-flight events are
// excluded from both numerator and denominator: treating them as successes
// would hide a stalled publisher, and treating them as failures would page on
// events that are about to succeed. A window with zero decided events yields no
// sample at all, so the policy reports the rule as notEvaluated rather than
// healthy (requirement: silence is not health).

import type { DatabaseTransaction } from '@chai/database';

import type { BurnRateSample } from './burn-rate';

/**
 * Every window the default multi-window policy touches, in seconds:
 * 5m / 30m / 1h / 2h / 6h / 24h. Sampling all six in one pass lets a single
 * harvest feed fast-, medium-, and slow-burn rules together.
 */
export const OUTBOX_BURN_RATE_WINDOWS: readonly number[] = [
  5 * 60,
  30 * 60,
  60 * 60,
  2 * 60 * 60,
  6 * 60 * 60,
  24 * 60 * 60,
] as const;

/** Decided/failed outbox counts observed for one trailing window. */
export interface OutboxDeliveryWindowCount {
  /** Events with a terminal outcome (PUBLISHED + DEAD_LETTER). */
  decidedEvents: number;
  /** Terminal failures (DEAD_LETTER) — a subset of decidedEvents. */
  deadLetterEvents: number;
  windowSeconds: number;
}

/**
 * Turns raw per-window counts into burn-rate samples.
 *
 * Windows with no decided events are dropped so `evaluateBurnRateAlerts` reports
 * the corresponding rule as notEvaluated instead of reading absent telemetry as
 * a healthy 0% error rate. Kept pure and separate from the query so it can be
 * unit-tested against known counts without a database.
 */
export function buildOutboxSamples(
  counts: readonly OutboxDeliveryWindowCount[],
): BurnRateSample[] {
  const samples: BurnRateSample[] = [];
  for (const count of counts) {
    if (count.decidedEvents <= 0) {
      continue;
    }
    samples.push({
      badEvents: count.deadLetterEvents,
      totalEvents: count.decidedEvents,
      windowSeconds: count.windowSeconds,
    });
  }
  return samples;
}

export interface SampleOutboxDeliveryOptions {
  /** Instant the trailing windows are measured back from. Defaults to now. */
  asOf?: Date;
  /** Window lengths in seconds. Defaults to {@link OUTBOX_BURN_RATE_WINDOWS}. */
  windows?: readonly number[];
}

/**
 * Samples outbox publish reliability per window for the current tenant.
 *
 * Must run inside a tenant-scoped transaction (see `withTenantTransaction`):
 * `chai.outbox_event` has FORCE row-level security with a tenant_isolation
 * policy, so the counts are restricted to the current tenant without an explicit
 * `tenant_id` filter — the same reliance the outbox dispatcher already makes.
 *
 * ponytail: windows are bucketed by `created_at` (a creation cohort) because the
 * schema has no terminal-decision timestamp for DEAD_LETTER — only `created_at`
 * and `published_at`. This slightly lags failures that take longer to settle
 * than successes; the upgrade path is a `settled_at` column so windows can be
 * bucketed by decision time.
 */
export async function sampleOutboxDelivery(
  transaction: DatabaseTransaction,
  options: SampleOutboxDeliveryOptions = {},
): Promise<BurnRateSample[]> {
  const windows = options.windows ?? OUTBOX_BURN_RATE_WINDOWS;
  const asOf = options.asOf ?? new Date();

  // count(oe.id) (not count(*)) so a window with no matching rows reports 0
  // rather than the single row the LEFT JOIN keeps from the window list.
  const rows = await transaction<
    Array<{ dead: number; decided: number; window_seconds: number }>
  >`
    SELECT
      w.window_seconds AS window_seconds,
      count(oe.id) FILTER (
        WHERE oe.status IN ('PUBLISHED', 'DEAD_LETTER')
      )::int AS decided,
      count(oe.id) FILTER (WHERE oe.status = 'DEAD_LETTER')::int AS dead
    FROM unnest(${windows as number[]}::int[]) AS w(window_seconds)
    LEFT JOIN chai.outbox_event AS oe
      ON oe.created_at > ${asOf}::timestamptz - make_interval(secs => w.window_seconds)
     AND oe.created_at <= ${asOf}::timestamptz
    GROUP BY w.window_seconds
  `;

  return buildOutboxSamples(
    rows.map((row) => ({
      decidedEvents: row.decided,
      deadLetterEvents: row.dead,
      windowSeconds: row.window_seconds,
    })),
  );
}
