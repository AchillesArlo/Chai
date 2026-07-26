import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRetentionRepository } from '../src/modules/retention/retention.repository';

describe('RetentionRepository', () => {
  let repo: InMemoryRetentionRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryRetentionRepository();
  });

  describe('Retention Policies', () => {
    it('should create retention policy', async () => {
      const policy = await repo.createPolicy(tenantId, {
        dataClass: 'conversations',
        retentionDays: 365,
        deletionMethod: 'soft_delete',
        cascadeDelete: false,
        exceptions: [],
      });

      expect(policy.id).toBeDefined();
      expect(policy.dataClass).toBe('conversations');
      expect(policy.retentionDays).toBe(365);
    });

    it('should list policies by tenant', async () => {
      await repo.createPolicy(tenantId, {
        dataClass: 'messages',
        retentionDays: 180,
        deletionMethod: 'hard_delete',
        cascadeDelete: false,
        exceptions: [],
      });

      const policies = await repo.listPolicies(tenantId);
      expect(policies).toHaveLength(1);
    });

    it('should update retention policy', async () => {
      const policy = await repo.createPolicy(tenantId, {
        dataClass: 'attachments',
        retentionDays: 90,
        deletionMethod: 'archive',
        cascadeDelete: false,
        exceptions: [],
      });

      const updated = await repo.updatePolicy(tenantId, policy.id, {
        retentionDays: 120,
      });

      expect(updated.retentionDays).toBe(120);
    });
  });

  describe('Retention Jobs', () => {
    it('should create retention job', async () => {
      const job = await repo.createJob({
        tenantId,
        dataClass: 'conversations',
        startedAt: new Date().toISOString(),
        status: 'running',
        errorMessage: null,
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('running');
      expect(job.recordsProcessed).toBe(0);
    });

    it('should update job status', async () => {
      const job = await repo.createJob({
        tenantId,
        dataClass: 'messages',
        startedAt: new Date().toISOString(),
        status: 'running',
        errorMessage: null,
      });

      const updated = await repo.updateJob(job.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        recordsProcessed: 100,
        recordsDeleted: 50,
      });

      expect(updated.status).toBe('completed');
      expect(updated.recordsProcessed).toBe(100);
    });
  });
});
