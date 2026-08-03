import { describe, expect, it } from 'vitest';

import {
  buildBookingSaga,
  runBookingWorkflow,
  type BookingEffects,
  type BookingProgress,
} from './booking';
import { runSaga } from './saga';

/** Records every effect call so a test can assert what did and did not happen. */
function trackedEffects(overrides: Partial<BookingEffects> = {}): {
  effects: BookingEffects;
  calls: string[];
} {
  const calls: string[] = [];
  const effects: BookingEffects = {
    reserveSlot: async () => {
      calls.push('reserveSlot');
      return { slotId: 'slot-1' };
    },
    releaseSlot: async (slotId) => {
      calls.push(`releaseSlot:${slotId}`);
    },
    capturePayment: async () => {
      calls.push('capturePayment');
      return { paymentId: 'pay-1' };
    },
    refundPayment: async (paymentId) => {
      calls.push(`refundPayment:${paymentId}`);
    },
    confirmBooking: async ({ slotId, paymentId }) => {
      calls.push(`confirmBooking:${slotId}:${paymentId}`);
      return { bookingId: 'booking-1' };
    },
    cancelBooking: async (bookingId) => {
      calls.push(`cancelBooking:${bookingId}`);
    },
    ...overrides,
  };
  return { effects, calls };
}

describe('booking workflow — happy path', () => {
  it('reserves, pays, confirms, and persists CONFIRMED/DONE', async () => {
    const { effects, calls } = trackedEffects();
    const progress: BookingProgress[] = [];

    const result = await runBookingWorkflow({
      effects,
      persist: (p) => void progress.push(p),
    });

    expect(result.status).toBe('DONE');
    expect(result.completedSteps).toEqual([
      'reserve-slot',
      'capture-payment',
      'confirm-booking',
    ]);
    expect(calls).toEqual([
      'reserveSlot',
      'capturePayment',
      'confirmBooking:slot-1:pay-1',
    ]);

    // Durable transitions: RUNNING/CREATING then DONE/CONFIRMED.
    expect(progress.map((p) => `${p.status}/${p.bookingState}`)).toEqual([
      'RUNNING/CREATING',
      'DONE/CONFIRMED',
    ]);
    expect(progress.at(-1)?.context.bookingId).toBe('booking-1');
  });
});

describe('booking workflow — payment fails after the slot is reserved', () => {
  it('releases the reserved slot and leaves NO half-done booking', async () => {
    const { effects, calls } = trackedEffects({
      capturePayment: async () => {
        calls.push('capturePayment');
        throw new Error('card declined');
      },
    });
    const progress: BookingProgress[] = [];

    const result = await runBookingWorkflow({
      effects,
      persist: (p) => void progress.push(p),
    });

    expect(result.status).toBe('FAILED');
    expect(result.failedStep).toBe('capture-payment');

    // The slot that WAS reserved gets released; nothing else lingers.
    expect(calls).toEqual(['reserveSlot', 'capturePayment', 'releaseSlot:slot-1']);
    // Never confirmed a booking, so there is no orphan to cancel.
    expect(calls).not.toContain('confirmBooking:slot-1:pay-1');
    expect(result.compensatedSteps).toEqual(['reserve-slot']);

    // Durable transitions: RUNNING/CREATING -> COMPENSATING/CANCELLED -> FAILED/CANCELLED.
    expect(progress.map((p) => `${p.status}/${p.bookingState}`)).toEqual([
      'RUNNING/CREATING',
      'COMPENSATING/CANCELLED',
      'FAILED/CANCELLED',
    ]);
    // No bookingId was ever produced — the invariant "no half-done booking".
    expect(progress.at(-1)?.context.bookingId).toBeUndefined();
  });
});

describe('booking workflow — an undo that fails routes to FAILED_REVIEW', () => {
  it('marks the run for human review when a compensation throws', async () => {
    const { effects } = trackedEffects({
      releaseSlot: async () => {
        throw new Error('calendar unreachable');
      },
      capturePayment: async () => {
        throw new Error('card declined');
      },
    });
    const progress: BookingProgress[] = [];

    const result = await runBookingWorkflow({
      effects,
      persist: (p) => void progress.push(p),
    });

    expect(result.status).toBe('FAILED');
    expect(result.compensationIncomplete).toBe(true);
    expect(progress.at(-1)?.bookingState).toBe('FAILED_REVIEW');
  });
});

describe('buildBookingSaga', () => {
  it('confirm-booking refuses to run without a slot and a payment', async () => {
    const { effects } = trackedEffects();
    const steps = buildBookingSaga(effects);
    const confirm = steps.find((s) => s.name === 'confirm-booking');
    expect(confirm).toBeDefined();

    // Run only the confirm step against an empty context: it must throw rather
    // than confirm a booking with missing prerequisites.
    const result = await runSaga(confirm ? [confirm] : [], {});
    expect(result.status).toBe('FAILED');
    expect(result.failedStep).toBe('confirm-booking');
  });
});
