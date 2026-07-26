import { describe, it, expect, beforeEach } from 'vitest';

import type {
  TenantIsolationSuite} from './suite';
import {
  createTenantIsolationSuite,
  getTenantIsolationSuite,
  resetTenantIsolationSuite,
  type TenantIsolationTest,
} from './suite';

describe('TenantIsolationSuite', () => {
  let suite: TenantIsolationSuite;

  beforeEach(() => {
    suite = createTenantIsolationSuite();
  });

  it('registers tests', () => {
    suite.register({
      dataClass: 'conversations',
      description: 'Conversations must not leak across tenants',
      query: async () => [],
      seed: [],
    });
    expect(suite.list()).toHaveLength(1);
  });

  it('passes when queries are tenant-scoped', async () => {
    const store: Map<string, Array<{ id: string; tenantId: string }>> = new Map([
      ['t1', [{ id: '1', tenantId: 't1' }]],
      ['t2', [{ id: '2', tenantId: 't2' }]],
    ]);

    const test: TenantIsolationTest = {
      dataClass: 'conversations',
      description: 'No leak',
      query: async (tenantId) => store.get(tenantId) ?? [],
      seed: [
        { data: { id: '1' }, tenantId: 't1' },
        { data: { id: '2' }, tenantId: 't2' },
      ],
    };
    suite.register(test);

    const result = await suite.runTest(test);
    expect(result.passed).toBe(true);
    expect(result.leaked).toBe(false);
    expect(result.leakedCount).toBe(0);
  });

  it('fails when data leaks across tenants', async () => {
    const store: Map<string, Array<{ id: string; tenantId: string }>> = new Map([
      ['t1', [{ id: '1', tenantId: 't1' }, { id: '2', tenantId: 't2' }]], // leak!
      ['t2', [{ id: '2', tenantId: 't2' }]],
    ]);

    const test: TenantIsolationTest = {
      dataClass: 'conversations',
      description: 'Leak test',
      query: async (tenantId) => store.get(tenantId) ?? [],
      seed: [
        { data: { id: '1' }, tenantId: 't1' },
        { data: { id: '2' }, tenantId: 't2' },
      ],
    };
    suite.register(test);

    const result = await suite.runTest(test);
    expect(result.passed).toBe(false);
    expect(result.leaked).toBe(true);
    expect(result.leakedCount).toBeGreaterThan(0);
  });

  it('fails when only one tenant provided', async () => {
    const test: TenantIsolationTest = {
      dataClass: 'single',
      description: 'Single tenant',
      query: async () => [],
      seed: [{ data: {}, tenantId: 't1' }],
    };
    suite.register(test);

    const result = await suite.runTest(test);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Need at least 2 tenants');
  });

  it('runs all registered tests', async () => {
    suite.register({
      dataClass: 'a',
      description: 'a',
      query: async (tenantId) => [{ id: '1', tenantId }],
      seed: [
        { data: {}, tenantId: 't1' },
        { data: {}, tenantId: 't2' },
      ],
    });
    suite.register({
      dataClass: 'b',
      description: 'b',
      query: async (tenantId) => [{ id: '2', tenantId }],
      seed: [
        { data: {}, tenantId: 't1' },
        { data: {}, tenantId: 't2' },
      ],
    });

    const results = await suite.runAll();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('returns certification summary', async () => {
    suite.register({
      dataClass: 'a',
      description: 'a',
      query: async (tenantId) => [{ id: '1', tenantId }],
      seed: [
        { data: {}, tenantId: 't1' },
        { data: {}, tenantId: 't2' },
      ],
    });

    const summary = await suite.summary();
    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(1);
    expect(summary.certified).toBe(true);
  });
});

describe('TenantIsolationSuite singleton', () => {
  beforeEach(() => {
    resetTenantIsolationSuite();
  });

  it('returns same instance', () => {
    expect(getTenantIsolationSuite()).toBe(getTenantIsolationSuite());
  });

  it('reset creates new instance', () => {
    const s1 = getTenantIsolationSuite();
    resetTenantIsolationSuite();
    const s2 = getTenantIsolationSuite();
    expect(s1).not.toBe(s2);
  });
});
