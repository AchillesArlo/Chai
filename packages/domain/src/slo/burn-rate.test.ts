import { describe, expect, it } from 'vitest';

import {
  computeBurnRate,
  DEFAULT_BURN_RATE_RULES,
  evaluateBurnRateAlerts,
  type SloObjective,
} from './burn-rate';

const availability: SloObjective = {
  objective: 0.999,
  periodDays: 30,
  sloId: 'api-availability',
};

/**
 * Fase 4 (R-19) regression: burn rate is derived from the objective, and alerts
 * carry window + objective + threshold. These fail if burn rate ever becomes a
 * free-form number again.
 */
describe('computeBurnRate', () => {
  it('reports 1x when errors exactly match the budget', () => {
    const result = computeBurnRate(availability, {
      badEvents: 1,
      totalEvents: 1_000,
      windowSeconds: 3_600,
    });
    expect(result.errorRate).toBeCloseTo(0.001, 10);
    expect(result.burnRate).toBeCloseTo(1, 10);
    // Burning at exactly 1x exhausts the budget at the end of the period.
    expect(result.secondsToExhaustion).toBeCloseTo(30 * 24 * 3_600, 5);
  });

  it('reports 14.4x for the classic fast-burn error rate', () => {
    const result = computeBurnRate(availability, {
      badEvents: 144,
      totalEvents: 10_000,
      windowSeconds: 3_600,
    });
    expect(result.burnRate).toBeCloseTo(14.4, 6);
    // One hour at 14.4x consumes 2% of a 30-day budget.
    expect(result.budgetConsumedFraction).toBeCloseTo(0.02, 6);
  });

  it('does not claim health when there is no traffic', () => {
    const result = computeBurnRate(availability, {
      badEvents: 0,
      totalEvents: 0,
      windowSeconds: 3_600,
    });
    expect(result.burnRate).toBe(0);
    expect(result.secondsToExhaustion).toBeNull();
  });

  it('refuses an impossible objective', () => {
    expect(() =>
      computeBurnRate(
        { objective: 1, periodDays: 30, sloId: 'perfect' },
        { badEvents: 0, totalEvents: 10, windowSeconds: 60 },
      ),
    ).toThrow(/invalid SLO objective/);
  });
});

describe('evaluateBurnRateAlerts', () => {
  const windows = (rate: number) =>
    DEFAULT_BURN_RATE_RULES.flatMap((rule) => [
      {
        badEvents: Math.round(10_000 * rate),
        totalEvents: 10_000,
        windowSeconds: rule.longWindowSeconds,
      },
      {
        badEvents: Math.round(10_000 * rate),
        totalEvents: 10_000,
        windowSeconds: rule.shortWindowSeconds,
      },
    ]);

  it('pages on fast burn and encodes window, objective, and threshold', () => {
    const { alerts } = evaluateBurnRateAlerts(availability, windows(0.0144));
    const fast = alerts.find((alert) => alert.rule === 'fast-burn');

    expect(fast?.firing).toBe(true);
    expect(fast?.severity).toBe('page');
    expect(fast?.threshold).toBe(14.4);
    expect(fast?.longWindowSeconds).toBe(3_600);
    expect(fast?.shortWindowSeconds).toBe(300);
    expect(fast?.objective).toBe(0.999);
    expect(fast?.periodDays).toBe(30);
    expect(fast?.sloId).toBe('api-availability');
  });

  it('stays quiet while inside the budget', () => {
    const { alerts } = evaluateBurnRateAlerts(availability, windows(0.0005));
    expect(alerts.every((alert) => !alert.firing)).toBe(true);
  });

  it('opens a ticket rather than paging for a slow burn', () => {
    // 0.35% error rate is 3.5x: above the slow rule, below the faster ones.
    const { alerts } = evaluateBurnRateAlerts(availability, windows(0.0035));
    const firing = alerts.filter((alert) => alert.firing);
    expect(firing.map((alert) => alert.rule)).toEqual(['slow-burn']);
    expect(firing[0]?.severity).toBe('ticket');
  });

  it('does not fire when only the long window is bad', () => {
    // The incident already ended: the long window still looks bad, the short one
    // has recovered, so paging someone now would be noise.
    const { alerts } = evaluateBurnRateAlerts(availability, [
      { badEvents: 144, totalEvents: 10_000, windowSeconds: 3_600 },
      { badEvents: 0, totalEvents: 10_000, windowSeconds: 300 },
    ]);
    expect(alerts.find((alert) => alert.rule === 'fast-burn')?.firing).toBe(false);
  });

  it('reports missing windows instead of assuming they are healthy', () => {
    const { alerts, notEvaluated } = evaluateBurnRateAlerts(availability, [
      { badEvents: 0, totalEvents: 10_000, windowSeconds: 3_600 },
    ]);
    expect(alerts).toHaveLength(0);
    expect(notEvaluated).toContain('fast-burn');
  });
});
