import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  BOOKING_WORKFLOW_TYPE,
  runBookingWorkflow,
  type BookingEffects,
} from '../src/workflow/booking';
import {
  claimWorkflowRuns,
  createWorkflowRun,
  getWorkflowRun,
  persistWorkflowStep,
} from '../src/workflow/run-store';
import { DOMAIN_IDS, seedFoundation } from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const tenantContext = { principalId: PRINCIPAL_A, tenantId: TENANT_A };

async function resetWorkflowRuns(adminDatabaseUrl: string): Promise<void> {
  const postgres = (await import('postgres')).default;
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`DELETE FROM chai.workflow_run`;
  } finally {
    await admin.end();
  }
}

describe('booking workflow — durable on chai.workflow_run (REQ-07-015)', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  beforeEach(async () => {
    await resetWorkflowRuns(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetWorkflowRuns(adminDatabaseUrl);
  });

  function trackedEffects(overrides: Partial<BookingEffects>): {
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
      confirmBooking: async () => {
        calls.push('confirmBooking');
        return { bookingId: 'booking-1' };
      },
      cancelBooking: async (bookingId) => {
        calls.push(`cancelBooking:${bookingId}`);
      },
      ...overrides,
    };
    return { effects, calls };
  }

  it('persists a mid-way payment failure as FAILED/CANCELLED with the slot compensated', async () => {
    const worker = createDatabase(workerDatabaseUrl);
    try {
      // A worker enqueues + claims the booking run (FASE 20 substrate).
      const created = await withTenantTransaction(worker, tenantContext, (tx) =>
        createWorkflowRun(tx, {
          tenantId: TENANT_A,
          workflowType: BOOKING_WORKFLOW_TYPE,
          currentStep: 'REQUESTED',
        }),
      );
      const runId = created.id;

      const claimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimWorkflowRuns(tx, {
          workflowType: BOOKING_WORKFLOW_TYPE,
          staleAfterMs: 60_000,
        }),
      );
      expect(claimed.map((r) => r.id)).toEqual([runId]);

      // Payment fails after the slot is reserved.
      const { effects, calls } = trackedEffects({
        capturePayment: async () => {
          calls.push('capturePayment');
          throw new Error('card declined');
        },
      });

      const result = await runBookingWorkflow({
        effects,
        persist: async (progress) => {
          await withTenantTransaction(worker, tenantContext, (tx) =>
            persistWorkflowStep(tx, runId, {
              status: progress.status,
              currentStep: progress.bookingState,
              state: {
                slotId: progress.context.slotId ?? null,
                paymentId: progress.context.paymentId ?? null,
                bookingId: progress.context.bookingId ?? null,
              },
            }),
          );
        },
      });

      expect(result.status).toBe('FAILED');
      expect(calls).toEqual([
        'reserveSlot',
        'capturePayment',
        'releaseSlot:slot-1',
      ]);

      // The durable row is the source of truth: FAILED, CANCELLED, slot recorded
      // but NO bookingId — the run is finished, not stranded half-open.
      const finalRun = await withTenantTransaction(worker, tenantContext, (tx) =>
        getWorkflowRun(tx, runId),
      );
      expect(finalRun?.status).toBe('FAILED');
      expect(finalRun?.currentStep).toBe('CANCELLED');
      expect(finalRun?.state['slotId']).toBe('slot-1');
      expect(finalRun?.state['bookingId']).toBeNull();
    } finally {
      await worker.end();
    }
  });

  it('persists the happy path as DONE/CONFIRMED with a bookingId', async () => {
    const worker = createDatabase(workerDatabaseUrl);
    try {
      const created = await withTenantTransaction(worker, tenantContext, (tx) =>
        createWorkflowRun(tx, {
          tenantId: TENANT_A,
          workflowType: BOOKING_WORKFLOW_TYPE,
          currentStep: 'REQUESTED',
        }),
      );
      const runId = created.id;

      await withTenantTransaction(worker, tenantContext, (tx) =>
        claimWorkflowRuns(tx, {
          workflowType: BOOKING_WORKFLOW_TYPE,
          staleAfterMs: 60_000,
        }),
      );

      const { effects } = trackedEffects({});
      const result = await runBookingWorkflow({
        effects,
        persist: async (progress) => {
          await withTenantTransaction(worker, tenantContext, (tx) =>
            persistWorkflowStep(tx, runId, {
              status: progress.status,
              currentStep: progress.bookingState,
              state: {
                slotId: progress.context.slotId ?? null,
                paymentId: progress.context.paymentId ?? null,
                bookingId: progress.context.bookingId ?? null,
              },
            }),
          );
        },
      });

      expect(result.status).toBe('DONE');
      const finalRun = await withTenantTransaction(worker, tenantContext, (tx) =>
        getWorkflowRun(tx, runId),
      );
      expect(finalRun?.status).toBe('DONE');
      expect(finalRun?.currentStep).toBe('CONFIRMED');
      expect(finalRun?.state['bookingId']).toBe('booking-1');
    } finally {
      await worker.end();
    }
  });
});
