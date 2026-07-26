import { describe, it, expect, beforeEach, vi } from 'vitest';

import type {
  RetentionJobRunner,
  AuditImmutabilityVerifier} from './runner';
import {
  createRetentionJobRunner,
  createAuditImmutabilityVerifier,
  type RetentionDataProvider,
} from './runner';

describe('RetentionJobRunner', () => {
  let runner: RetentionJobRunner;
  let provider: RetentionDataProvider;

  beforeEach(() => {
    provider = {
      countRecords: vi.fn().mockResolvedValue(0),
      deleteRecords: vi.fn().mockResolvedValue(0),
      findExpired: vi.fn().mockResolvedValue([]),
    };
    runner = createRetentionJobRunner(provider);
  });

  it('registers policies', () => {
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'conversations',
      deletionMethod: 'soft_delete',
      id: 'p1',
      retentionDays: 90,
      tenantId: 't1',
    });
    expect(runner.listPolicies()).toHaveLength(1);
  });

  it('skips unknown policy', async () => {
    const job = await runner.runPolicy('unknown');
    expect(job.status).toBe('skipped');
    expect(job.deletedCount).toBe(0);
  });

  it('runs policy and deletes expired records', async () => {
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'conversations',
      deletionMethod: 'hard_delete',
      id: 'p1',
      retentionDays: 90,
      tenantId: 't1',
    });

    (provider.findExpired as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'r1', tenantId: 't1' },
      { id: 'r2', tenantId: 't1' },
    ]);
    (provider.deleteRecords as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const job = await runner.runPolicy('p1');
    expect(job.status).toBe('completed');
    expect(job.deletedCount).toBe(2);
    expect(job.dataClass).toBe('conversations');
  });

  it('handles zero expired records', async () => {
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'logs',
      deletionMethod: 'archive',
      id: 'p1',
      retentionDays: 30,
      tenantId: 't1',
    });

    const job = await runner.runPolicy('p1');
    expect(job.status).toBe('completed');
    expect(job.deletedCount).toBe(0);
  });

  it('records failed jobs', async () => {
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'logs',
      deletionMethod: 'soft_delete',
      id: 'p1',
      retentionDays: 30,
      tenantId: 't1',
    });

    (provider.findExpired as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

    const job = await runner.runPolicy('p1');
    expect(job.status).toBe('failed');
    expect(job.error).toContain('DB error');
  });

  it('runs all policies', async () => {
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'a',
      deletionMethod: 'soft_delete',
      id: 'p1',
      retentionDays: 30,
      tenantId: 't1',
    });
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'b',
      deletionMethod: 'hard_delete',
      id: 'p2',
      retentionDays: 90,
      tenantId: 't1',
    });

    const results = await runner.runAll();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'completed')).toBe(true);
  });

  it('filters job history by tenant', async () => {
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'a',
      deletionMethod: 'soft_delete',
      id: 'p1',
      retentionDays: 30,
      tenantId: 't1',
    });
    runner.registerPolicy({
      cascadeDelete: false,
      dataClass: 'b',
      deletionMethod: 'soft_delete',
      id: 'p2',
      retentionDays: 30,
      tenantId: 't2',
    });

    await runner.runAll();
    const t1History = runner.getHistory('t1');
    expect(t1History).toHaveLength(1);
    expect(t1History[0]?.tenantId).toBe('t1');
  });
});

describe('AuditImmutabilityVerifier', () => {
  let verifier: AuditImmutabilityVerifier;

  beforeEach(() => {
    verifier = createAuditImmutabilityVerifier();
  });

  it('appends entries to hash chain', () => {
    const result = verifier.append({
      id: 'e1',
      payload: 'first event',
      tenantId: 't1',
    });
    expect(result.hash).toBeTruthy();
    expect(result.previousHash).toBe('genesis');
  });

  it('chains entries via previousHash', () => {
    const r1 = verifier.append({ id: 'e1', payload: 'first', tenantId: 't1' });
    const r2 = verifier.append({ id: 'e2', payload: 'second', tenantId: 't1' });

    expect(r2.previousHash).toBe(r1.hash);
  });

  it('verifies intact hash chain', () => {
    verifier.append({ id: 'e1', payload: 'first', tenantId: 't1' });
    verifier.append({ id: 'e2', payload: 'second', tenantId: 't1' });
    verifier.append({ id: 'e3', payload: 'third', tenantId: 't1' });

    const result = verifier.verify('t1');
    expect(result.passed).toBe(true);
    expect(result.brokenLinks).toBe(0);
    expect(result.checkedCount).toBe(3);
  });

  it('isolates hash chains per tenant', () => {
    verifier.append({ id: 'e1', payload: 'first', tenantId: 't1' });
    verifier.append({ id: 'e2', payload: 'second', tenantId: 't2' });

    const t1Result = verifier.verify('t1');
    const t2Result = verifier.verify('t2');

    expect(t1Result.passed).toBe(true);
    expect(t1Result.checkedCount).toBe(1);
    expect(t2Result.passed).toBe(true);
    expect(t2Result.checkedCount).toBe(1);
  });

  it('returns entries for a tenant', () => {
    verifier.append({ id: 'e1', payload: 'first', tenantId: 't1' });
    verifier.append({ id: 'e2', payload: 'second', tenantId: 't2' });

    const entries = verifier.getEntries('t1');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('e1');
  });
});
