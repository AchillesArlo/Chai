import { describe, expect, it } from 'vitest';

import { predictEtaValue } from './eta';

/**
 * Fase 2 (R-13) regression: an ETA must trace back to a real signal.
 *
 * This fails if the "no signal" branch ever returns a fabricated date again. A
 * date that looks authoritative but is invented is worse than no date, because a
 * customer plans around it (17 §7.5).
 */
describe('advisory ETA prediction', () => {
  const shippedAt = new Date('2026-07-26T00:00:00Z');

  it('returns no date at all when there is no provider signal', () => {
    const result = predictEtaValue({ shipmentId: 's1', shippedAt });

    expect(result.predictedDate).toBeNull();
    expect(result.confidence).toBe('NONE');
    expect(result.factors.source).toBe('NO_SIGNAL');
  });

  it('uses the carrier-declared window when present', () => {
    const result = predictEtaValue({
      carrierTransitDays: 3,
      shipmentId: 's1',
      shippedAt,
    });

    expect(result.confidence).toBe('MEDIUM');
    expect(result.factors.source).toBe('CARRIER_DECLARED');
    expect(result.predictedDate?.toISOString().slice(0, 10)).toBe('2026-07-29');
  });

  it('records the freshness of the signal it used', () => {
    const result = predictEtaValue({
      carrierTransitDays: 2,
      shipmentId: 's1',
      shippedAt,
    });

    expect(result.factors.freshnessAt).toBe(shippedAt.toISOString());
  });

  it('is most confident when carrier and distance agree on a floor', () => {
    const result = predictEtaValue({
      carrierTransitDays: 2,
      distanceKm: 1_600,
      shipmentId: 's1',
      shippedAt,
    });

    expect(result.confidence).toBe('HIGH');
    expect(result.factors.source).toBe('CARRIER_AND_DISTANCE');
    // Never under-promise: the slower of the two signals wins.
    expect(result.predictedDate?.toISOString().slice(0, 10)).toBe('2026-07-30');
  });
});
