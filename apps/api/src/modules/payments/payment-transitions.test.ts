import { describe, expect, it } from 'vitest';

import {
  decidePaymentTransition,
  isTerminalPaymentStatus,
} from '@chai/domain';

/**
 * Fase 2 (R-10) regression: a verified webhook is still not allowed to undo a
 * settled payment, and an older provider event must lose to a newer one.
 */
describe('payment status transitions', () => {
  it('applies a normal progression', () => {
    expect(decidePaymentTransition({ current: 'PENDING', next: 'PAID' })).toEqual({
      kind: 'APPLY',
    });
    expect(
      decidePaymentTransition({ current: 'CREATED', next: 'PENDING' }),
    ).toEqual({ kind: 'APPLY' });
  });

  it('never regresses away from PAID', () => {
    for (const next of ['PENDING', 'FAILED', 'EXPIRED', 'CREATED'] as const) {
      expect(decidePaymentTransition({ current: 'PAID', next })).toEqual({
        kind: 'IGNORE',
        reason: 'TERMINAL',
      });
    }
  });

  it('treats a repeat of the same status as a duplicate', () => {
    expect(decidePaymentTransition({ current: 'PAID', next: 'PAID' })).toEqual({
      kind: 'IGNORE',
      reason: 'DUPLICATE',
    });
  });

  it('keeps other terminal states terminal', () => {
    expect(decidePaymentTransition({ current: 'EXPIRED', next: 'PAID' })).toEqual({
      kind: 'IGNORE',
      reason: 'TERMINAL',
    });
    expect(decidePaymentTransition({ current: 'FAILED', next: 'PAID' })).toEqual({
      kind: 'IGNORE',
      reason: 'TERMINAL',
    });
  });

  it('lets reconciliation resolve an uncertain attempt', () => {
    expect(
      decidePaymentTransition({ current: 'UNKNOWN_RESULT', next: 'PAID' }),
    ).toEqual({ kind: 'APPLY' });
    expect(
      decidePaymentTransition({ current: 'UNKNOWN_RESULT', next: 'FAILED' }),
    ).toEqual({ kind: 'APPLY' });
  });

  it('ignores an event that the provider observed earlier than the last applied one', () => {
    const decision = decidePaymentTransition({
      current: 'PENDING',
      eventAt: new Date('2026-07-26T10:00:00Z'),
      next: 'FAILED',
      observedAt: new Date('2026-07-26T10:05:00Z'),
    });
    expect(decision).toEqual({ kind: 'IGNORE', reason: 'STALE_EVENT' });
  });

  it('applies an event observed after the last applied one', () => {
    const decision = decidePaymentTransition({
      current: 'PENDING',
      eventAt: new Date('2026-07-26T10:10:00Z'),
      next: 'PAID',
      observedAt: new Date('2026-07-26T10:05:00Z'),
    });
    expect(decision).toEqual({ kind: 'APPLY' });
  });

  it('classifies terminal statuses', () => {
    expect(isTerminalPaymentStatus('PAID')).toBe(true);
    expect(isTerminalPaymentStatus('EXPIRED')).toBe(true);
    expect(isTerminalPaymentStatus('FAILED')).toBe(true);
    expect(isTerminalPaymentStatus('PENDING')).toBe(false);
    expect(isTerminalPaymentStatus('UNKNOWN_RESULT')).toBe(false);
  });
});
