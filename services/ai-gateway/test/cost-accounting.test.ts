import { describe, it, expect, beforeEach } from 'vitest';

import type {
  CostAccountingStore} from '../src/cost-accounting';
import {
  createCostAccountingStore,
  getCostAccountingStore,
  resetCostAccountingStore,
} from '../src/cost-accounting';

describe('CostAccountingStore', () => {
  let store: CostAccountingStore;

  beforeEach(() => {
    store = createCostAccountingStore();
  });

  it('records a usage entry', () => {
    const record = store.record({
      completionTokens: 100,
      costUsd: 0.05,
      model: 'gpt-4o-mini',
      promptTokens: 50,
      tenantId: 'tenant-1',
      traceId: 'trace-1',
      totalTokens: 150,
    });

    expect(record.usageId).toBeTruthy();
    expect(record.recordedAt).toBeInstanceOf(Date);
    expect(record.completionTokens).toBe(100);
    expect(record.costUsd).toBe(0.05);
  });

  it('retrieves records for a tenant', () => {
    store.record({
      completionTokens: 100,
      costUsd: 0.05,
      model: 'gpt-4o',
      promptTokens: 50,
      tenantId: 'tenant-1',
      traceId: 't1',
      totalTokens: 150,
    });
    store.record({
      completionTokens: 200,
      costUsd: 0.1,
      model: 'gpt-4o',
      promptTokens: 100,
      tenantId: 'tenant-2',
      traceId: 't2',
      totalTokens: 300,
    });

    const records = store.getRecords('tenant-1');
    expect(records).toHaveLength(1);
    expect(records[0]?.tenantId).toBe('tenant-1');
  });

  it('aggregates usage summary for a tenant', () => {
    store.record({
      completionTokens: 100,
      costUsd: 0.05,
      model: 'gpt-4o',
      promptTokens: 50,
      tenantId: 'tenant-1',
      traceId: 't1',
      totalTokens: 150,
    });
    store.record({
      completionTokens: 200,
      costUsd: 0.1,
      model: 'gpt-4o',
      promptTokens: 100,
      tenantId: 'tenant-1',
      traceId: 't2',
      totalTokens: 300,
    });

    const summary = store.getSummary('tenant-1');
    expect(summary.completionTokens).toBe(300);
    expect(summary.promptTokens).toBe(150);
    expect(summary.totalTokens).toBe(450);
    expect(summary.costUsd).toBeCloseTo(0.15, 5);
    expect(summary.usageCount).toBe(2);
  });

  it('returns zero summary for unknown tenant', () => {
    const summary = store.getSummary('unknown');
    expect(summary.completionTokens).toBe(0);
    expect(summary.usageCount).toBe(0);
  });

  it('gets all tenant summaries', () => {
    store.record({
      completionTokens: 100,
      costUsd: 0.05,
      model: 'gpt-4o',
      promptTokens: 50,
      tenantId: 't1',
      traceId: 't1',
      totalTokens: 150,
    });
    store.record({
      completionTokens: 200,
      costUsd: 0.1,
      model: 'gpt-4o',
      promptTokens: 100,
      tenantId: 't2',
      traceId: 't2',
      totalTokens: 300,
    });

    const summaries = store.getAllSummaries();
    expect(summaries).toHaveLength(2);
  });

  it('checks budget exceeded', () => {
    store.record({
      completionTokens: 100,
      costUsd: 5,
      model: 'gpt-4o',
      promptTokens: 50,
      tenantId: 't1',
      traceId: 't1',
      totalTokens: 150,
    });

    expect(store.hasExceededBudget('t1', 10)).toBe(false);
    expect(store.hasExceededBudget('t1', 5)).toBe(true);
  });

  it('clears all records', () => {
    store.record({
      completionTokens: 100,
      costUsd: 0.05,
      model: 'gpt-4o',
      promptTokens: 50,
      tenantId: 't1',
      traceId: 't1',
      totalTokens: 150,
    });
    store.clear();
    expect(store.getRecords('t1')).toHaveLength(0);
  });
});

describe('CostAccountingStore singleton', () => {
  beforeEach(() => {
    resetCostAccountingStore();
  });

  it('returns same instance on repeated calls', () => {
    const s1 = getCostAccountingStore();
    const s2 = getCostAccountingStore();
    expect(s1).toBe(s2);
  });

  it('reset creates a new instance', () => {
    const s1 = getCostAccountingStore();
    resetCostAccountingStore();
    const s2 = getCostAccountingStore();
    expect(s1).not.toBe(s2);
  });
});
