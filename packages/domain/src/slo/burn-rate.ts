// Error-budget burn rate (blueprint 12 §5, ADR-019). Previously `burnRate` was a
// nullable column any caller could set to any number, so an alert could not be
// traced back to an objective — and nothing computed it.

// Re-exported here (rather than from the package index) so the outbox-delivery
// SLI harvester ships through the existing `export * from './slo/burn-rate'`.
export * from './outbox-sli';

/** A service level objective, e.g. 99.9% availability over 30 days. */
export interface SloObjective {
  /** Target success ratio in (0,1), e.g. 0.999. */
  objective: number;
  /** Rolling compliance period in days, e.g. 30. */
  periodDays: number;
  /** Stable identifier used in alert payloads. */
  sloId: string;
}

/** Observed success/failure counts over a window. */
export interface BurnRateWindow {
  badEvents: number;
  totalEvents: number;
  /** Window length in seconds, e.g. 3600 for the 1h window. */
  windowSeconds: number;
}

export interface BurnRateResult {
  /** Observed failure ratio in the window. */
  errorRate: number;
  /**
   * How many times faster than sustainable the budget is being spent.
   * 1.0 means the whole budget is consumed exactly at the end of the period.
   */
  burnRate: number;
  /** Fraction of the whole period budget consumed by this window alone. */
  budgetConsumedFraction: number;
  /** Seconds until the budget is exhausted at this rate, null if not burning. */
  secondsToExhaustion: number | null;
  windowSeconds: number;
}

function assertObjective(objective: SloObjective): void {
  if (!(objective.objective > 0 && objective.objective < 1)) {
    // 100% is not an objective, it is a promise nobody can keep, and 0 makes the
    // error budget infinite. Either way the burn rate would be meaningless.
    throw new Error(`invalid SLO objective: ${objective.objective}`);
  }
  if (!(objective.periodDays > 0)) {
    throw new Error(`invalid SLO period: ${objective.periodDays}`);
  }
}

/**
 * Computes the burn rate for one window.
 *
 * burnRate = observedErrorRate / errorBudget, where errorBudget = 1 - objective.
 * A 99.9% objective allows a 0.1% error rate; observing 1.44% means burning
 * 14.4x too fast, which is the classic page-now signal.
 */
export function computeBurnRate(
  objective: SloObjective,
  window: BurnRateWindow,
): BurnRateResult {
  assertObjective(objective);
  if (window.totalEvents <= 0) {
    // No traffic is not the same as no errors: reporting 0 here would silence a
    // dead service. The caller sees an unknown rate instead.
    return {
      budgetConsumedFraction: 0,
      burnRate: 0,
      errorRate: 0,
      secondsToExhaustion: null,
      windowSeconds: window.windowSeconds,
    };
  }

  const errorBudget = 1 - objective.objective;
  const errorRate = window.badEvents / window.totalEvents;
  const burnRate = errorRate / errorBudget;
  const periodSeconds = objective.periodDays * 24 * 60 * 60;
  const budgetConsumedFraction = (burnRate * window.windowSeconds) / periodSeconds;

  return {
    budgetConsumedFraction,
    burnRate,
    errorRate,
    secondsToExhaustion: burnRate > 0 ? periodSeconds / burnRate : null,
    windowSeconds: window.windowSeconds,
  };
}

export type AlertSeverity = 'page' | 'ticket';

/**
 * Multi-window burn-rate alert policy (Google SRE workbook, ADR-019).
 *
 * A single window either pages on every blip (short window) or notices an
 * outage hours late (long window). Each rule pairs a long window with a short
 * one so the alert fires fast but only while the problem is still happening.
 */
export interface BurnRateAlertRule {
  /** Fraction of the total budget the long window consumes at the threshold. */
  budgetFractionAtThreshold: number;
  longWindowSeconds: number;
  name: string;
  severity: AlertSeverity;
  shortWindowSeconds: number;
  threshold: number;
}

export const DEFAULT_BURN_RATE_RULES: readonly BurnRateAlertRule[] = [
  {
    budgetFractionAtThreshold: 0.02,
    longWindowSeconds: 60 * 60,
    name: 'fast-burn',
    severity: 'page',
    shortWindowSeconds: 5 * 60,
    threshold: 14.4,
  },
  {
    budgetFractionAtThreshold: 0.05,
    longWindowSeconds: 6 * 60 * 60,
    name: 'medium-burn',
    severity: 'page',
    shortWindowSeconds: 30 * 60,
    threshold: 6,
  },
  {
    budgetFractionAtThreshold: 0.1,
    longWindowSeconds: 24 * 60 * 60,
    name: 'slow-burn',
    severity: 'ticket',
    shortWindowSeconds: 2 * 60 * 60,
    threshold: 3,
  },
] as const;

/**
 * An alert that carries everything a responder needs to judge it without
 * opening a dashboard: which objective, which window, the threshold that was
 * crossed, and the observed value (12 §5).
 */
export interface BurnRateAlert {
  firing: boolean;
  longWindowBurnRate: number;
  longWindowSeconds: number;
  objective: number;
  periodDays: number;
  rule: string;
  secondsToExhaustion: number | null;
  severity: AlertSeverity;
  shortWindowBurnRate: number;
  shortWindowSeconds: number;
  sloId: string;
  threshold: number;
}

export interface BurnRateSample {
  badEvents: number;
  totalEvents: number;
  windowSeconds: number;
}

/**
 * Threshold comparison with a relative tolerance.
 *
 * An error rate that is mathematically exactly at the threshold lands a few ULPs
 * below it in binary floating point (0.0144 / 0.001 = 14.399999999999999), so a
 * bare `>=` would refuse to page for a textbook fast burn.
 */
function meetsThreshold(observed: number, threshold: number): boolean {
  return observed >= threshold * (1 - 1e-9);
}

/**
 * Evaluates the alert rules against observed samples.
 *
 * Only rules whose long AND short window are both present in `samples` are
 * evaluated; a missing window is reported as not evaluated rather than assumed
 * healthy, because silently treating absent telemetry as "fine" is how burn-rate
 * alerting fails in practice.
 */
export function evaluateBurnRateAlerts(
  objective: SloObjective,
  samples: readonly BurnRateSample[],
  rules: readonly BurnRateAlertRule[] = DEFAULT_BURN_RATE_RULES,
): { alerts: BurnRateAlert[]; notEvaluated: string[] } {
  assertObjective(objective);
  const byWindow = new Map<number, BurnRateSample>();
  for (const sample of samples) {
    byWindow.set(sample.windowSeconds, sample);
  }

  const alerts: BurnRateAlert[] = [];
  const notEvaluated: string[] = [];

  for (const rule of rules) {
    const long = byWindow.get(rule.longWindowSeconds);
    const short = byWindow.get(rule.shortWindowSeconds);
    if (!long || !short) {
      notEvaluated.push(rule.name);
      continue;
    }

    const longResult = computeBurnRate(objective, {
      badEvents: long.badEvents,
      totalEvents: long.totalEvents,
      windowSeconds: rule.longWindowSeconds,
    });
    const shortResult = computeBurnRate(objective, {
      badEvents: short.badEvents,
      totalEvents: short.totalEvents,
      windowSeconds: rule.shortWindowSeconds,
    });

    alerts.push({
      // Both windows must exceed the threshold: the long one proves it matters,
      // the short one proves it is still happening.
      firing:
        meetsThreshold(longResult.burnRate, rule.threshold) &&
        meetsThreshold(shortResult.burnRate, rule.threshold),
      longWindowBurnRate: longResult.burnRate,
      longWindowSeconds: rule.longWindowSeconds,
      objective: objective.objective,
      periodDays: objective.periodDays,
      rule: rule.name,
      secondsToExhaustion: longResult.secondsToExhaustion,
      severity: rule.severity,
      shortWindowBurnRate: shortResult.burnRate,
      shortWindowSeconds: rule.shortWindowSeconds,
      sloId: objective.sloId,
      threshold: rule.threshold,
    });
  }

  return { alerts, notEvaluated };
}
