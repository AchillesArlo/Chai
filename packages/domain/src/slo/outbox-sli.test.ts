import { describe, expect, it } from 'vitest';

import { evaluateBurnRateAlerts, type SloObjective } from './burn-rate';
import { buildOutboxSamples, OUTBOX_BURN_RATE_WINDOWS } from './outbox-sli';

const availability: SloObjective = {
  objective: 0.999,
  periodDays: 30,
  sloId: 'outbox-delivery',
};

describe('buildOutboxSamples', () => {
  it('maps decided/dead-letter counts to burn-rate samples', () => {
    const samples = buildOutboxSamples([
      { decidedEvents: 1_000, deadLetterEvents: 5, windowSeconds: 300 },
      { decidedEvents: 10_000, deadLetterEvents: 144, windowSeconds: 3_600 },
    ]);

    expect(samples).toEqual([
      { badEvents: 5, totalEvents: 1_000, windowSeconds: 300 },
      { badEvents: 144, totalEvents: 10_000, windowSeconds: 3_600 },
    ]);
  });

  it('omits windows with no decided events so they are never read as healthy', () => {
    const samples = buildOutboxSamples([
      // No settled events: in-flight only. Must not become a 0%-error sample.
      { decidedEvents: 0, deadLetterEvents: 0, windowSeconds: 300 },
      { decidedEvents: 50, deadLetterEvents: 0, windowSeconds: 3_600 },
    ]);

    expect(samples).toEqual([{ badEvents: 0, totalEvents: 50, windowSeconds: 3_600 }]);
  });

  it('leaves a rule notEvaluated when its windows produced no samples', () => {
    // Only the fast rule's long window has data; its short window is empty, so
    // the fast rule cannot be judged and must be reported, not assumed healthy.
    const samples = buildOutboxSamples([
      { decidedEvents: 10_000, deadLetterEvents: 0, windowSeconds: 3_600 },
      { decidedEvents: 0, deadLetterEvents: 0, windowSeconds: 300 },
    ]);

    const { alerts, notEvaluated } = evaluateBurnRateAlerts(availability, samples);
    expect(alerts).toHaveLength(0);
    expect(notEvaluated).toContain('fast-burn');
  });

  it('covers exactly the six windows the default policy needs', () => {
    expect([...OUTBOX_BURN_RATE_WINDOWS].sort((first, second) => first - second)).toEqual([
      300, 1_800, 3_600, 7_200, 21_600, 86_400,
    ]);
  });
});
