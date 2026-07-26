import type { Database, DatabaseTransaction, TenantContext } from '@chai/database';
import type { BurnRateSample, SloObjective } from '@chai/domain';
import { describe, expect, it } from 'vitest';

import {
  runBurnRateHarvest,
  type BurnRateAlertEntry,
  type BurnRateAlertSink,
} from '../src/burn-rate-harvester';

const objective: SloObjective = {
  objective: 0.999,
  periodDays: 30,
  sloId: 'outbox-delivery',
};

const tenant: TenantContext = {
  principalId: '01890f47-9b3c-7cc2-98e8-1234567890a1',
  tenantId: '01890f47-9b3c-7cc2-98e8-1234567890b2',
};

// The sampler and sink are injected, so the transaction is never touched here.
const stubTransaction = {} as DatabaseTransaction;
const runInTenant = <T>(
  _database: Database,
  _context: TenantContext,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> => operation(stubTransaction);

function recordingSink(): { entries: BurnRateAlertEntry[]; sink: BurnRateAlertSink } {
  const entries: BurnRateAlertEntry[] = [];
  return {
    entries,
    sink: {
      record: async (_transaction, entry) => {
        entries.push(entry);
      },
    },
  };
}

describe('runBurnRateHarvest', () => {
  it('reports every rule as notEvaluated and fires nothing when no window has data', async () => {
    const { entries, sink } = recordingSink();

    const reports = await runBurnRateHarvest({
      database: {} as Database,
      objective,
      runInTenant,
      sampler: async () => [],
      sink,
      tenants: [tenant],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]?.firing).toEqual([]);
    expect(reports[0]?.notEvaluated).toEqual(
      expect.arrayContaining(['fast-burn', 'medium-burn', 'slow-burn']),
    );
    // An empty outbox must never look like a healthy service.
    expect(entries).toEqual([]);
  });

  it('pages and forwards the alert when the fast-burn windows are burning hard', async () => {
    const { entries, sink } = recordingSink();
    // 1.44% error rate is 14.4x a 99.9% objective: the classic fast-burn page.
    const fastBurnSamples: BurnRateSample[] = [
      { badEvents: 144, totalEvents: 10_000, windowSeconds: 3_600 },
      { badEvents: 144, totalEvents: 10_000, windowSeconds: 300 },
    ];

    const reports = await runBurnRateHarvest({
      database: {} as Database,
      objective,
      runInTenant,
      sampler: async () => fastBurnSamples,
      sink,
      tenants: [tenant],
    });

    const fast = reports[0]?.firing.find((alert) => alert.rule === 'fast-burn');
    expect(fast?.firing).toBe(true);
    expect(fast?.severity).toBe('page');
    // Medium/slow need 30m/6h/2h/24h windows that were not sampled, so they
    // stay unjudged rather than firing or reading as healthy.
    expect(reports[0]?.notEvaluated).toEqual(
      expect.arrayContaining(['medium-burn', 'slow-burn']),
    );

    // Every firing alert was forwarded, tagged with its tenant.
    expect(entries).toHaveLength(reports[0]?.firing.length ?? 0);
    expect(entries.every((entry) => entry.tenantId === tenant.tenantId)).toBe(true);
    expect(
      entries.some(
        (entry) => entry.alert.rule === 'fast-burn' && entry.alert.severity === 'page',
      ),
    ).toBe(true);
  });

  it('does not forward a ticket alert as a page and honours severity per rule', async () => {
    const { entries, sink } = recordingSink();
    // 0.35% error rate is 3.5x: above the slow (3x) rule, below fast/medium.
    const slowBurnSamples: BurnRateSample[] = [
      { badEvents: 35, totalEvents: 10_000, windowSeconds: 86_400 },
      { badEvents: 35, totalEvents: 10_000, windowSeconds: 7_200 },
    ];

    const reports = await runBurnRateHarvest({
      database: {} as Database,
      objective,
      runInTenant,
      sampler: async () => slowBurnSamples,
      sink,
      tenants: [tenant],
    });

    expect(reports[0]?.firing.map((alert) => alert.rule)).toEqual(['slow-burn']);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.alert.severity).toBe('ticket');
  });
});
