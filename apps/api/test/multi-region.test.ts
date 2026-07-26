import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryMultiRegionRepository } from '../src/modules/multi-region/multi-region.repository';

describe('MultiRegionRepository', () => {
  let repo: InMemoryMultiRegionRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryMultiRegionRepository();
  });

  describe('Tenant Regions', () => {
    it('should create tenant region', async () => {
      const region = await repo.createTenantRegion(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        isPrimary: true,
        dataResidencyPolicy: 'standard',
      });

      expect(region.id).toBeDefined();
      expect(region.region).toBe('ap-southeast-1');
      expect(region.isPrimary).toBe(true);
    });

    it('should get tenant region by name', async () => {
      await repo.createTenantRegion(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        isPrimary: true,
        dataResidencyPolicy: 'standard',
      });

      const region = await repo.getTenantRegion(tenantId, 'ap-southeast-1');
      expect(region).toBeDefined();
      expect(region?.isPrimary).toBe(true);
    });

    it('should list tenant regions', async () => {
      await repo.createTenantRegion(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        isPrimary: true,
        dataResidencyPolicy: 'standard',
      });

      await repo.createTenantRegion(tenantId, {
        tenantId,
        region: 'eu-west-1',
        isPrimary: false,
        dataResidencyPolicy: 'strict',
      });

      const regions = await repo.listTenantRegions(tenantId);
      expect(regions).toHaveLength(2);
    });

    it('should update tenant region', async () => {
      const region = await repo.createTenantRegion(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        isPrimary: false,
        dataResidencyPolicy: 'standard',
      });

      const updated = await repo.updateTenantRegion(tenantId, region.id, {
        isPrimary: true,
      });

      expect(updated.isPrimary).toBe(true);
    });

    it('should delete tenant region', async () => {
      const region = await repo.createTenantRegion(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        isPrimary: true,
        dataResidencyPolicy: 'standard',
      });

      await repo.deleteTenantRegion(tenantId, region.id);

      const found = await repo.getTenantRegion(tenantId, 'ap-southeast-1');
      expect(found).toBeNull();
    });
  });

  describe('Routing Rules', () => {
    it('should create routing rule', async () => {
      const rule = await repo.createRoutingRule(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        routingType: 'latency',
        priority: 100,
        isActive: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.routingType).toBe('latency');
    });

    it('should list routing rules', async () => {
      await repo.createRoutingRule(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        routingType: 'latency',
        priority: 100,
        isActive: true,
      });

      await repo.createRoutingRule(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'us-east-1',
        routingType: 'cost',
        priority: 200,
        isActive: true,
      });

      const rules = await repo.listRoutingRules(tenantId);
      expect(rules).toHaveLength(2);
    });

    it('should update routing rule', async () => {
      const rule = await repo.createRoutingRule(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        routingType: 'latency',
        priority: 100,
        isActive: true,
      });

      const updated = await repo.updateRoutingRule(tenantId, rule.id, {
        isActive: false,
      });

      expect(updated.isActive).toBe(false);
    });

    it('should delete routing rule', async () => {
      const rule = await repo.createRoutingRule(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        routingType: 'latency',
        priority: 100,
        isActive: true,
      });

      await repo.deleteRoutingRule(tenantId, rule.id);

      const rules = await repo.listRoutingRules(tenantId);
      expect(rules).toHaveLength(0);
    });
  });

  describe('Replication Status', () => {
    it('should upsert replication status', async () => {
      const status = await repo.upsertReplicationStatus(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        entityType: 'conversation',
        entityId: 'conv-123',
        lastReplicatedAt: '2026-01-15T10:00:00Z',
        replicationLagMs: 50,
        status: 'synced',
      });

      expect(status.id).toBeDefined();
      expect(status.status).toBe('synced');
      expect(status.replicationLagMs).toBe(50);
    });

    it('should update existing replication status', async () => {
      await repo.upsertReplicationStatus(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        entityType: 'conversation',
        entityId: 'conv-123',
        lastReplicatedAt: '2026-01-15T10:00:00Z',
        replicationLagMs: 50,
        status: 'synced',
      });

      const updated = await repo.upsertReplicationStatus(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        entityType: 'conversation',
        entityId: 'conv-123',
        lastReplicatedAt: '2026-01-15T10:05:00Z',
        replicationLagMs: 120,
        status: 'lagging',
      });

      expect(updated.status).toBe('lagging');
      expect(updated.replicationLagMs).toBe(120);
    });

    it('should list replication status by entity', async () => {
      await repo.upsertReplicationStatus(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        entityType: 'conversation',
        entityId: 'conv-123',
        lastReplicatedAt: '2026-01-15T10:00:00Z',
        replicationLagMs: 50,
        status: 'synced',
      });

      await repo.upsertReplicationStatus(tenantId, {
        tenantId,
        sourceRegion: 'ap-southeast-1',
        targetRegion: 'eu-west-1',
        entityType: 'payment',
        entityId: 'pay-456',
        lastReplicatedAt: '2026-01-15T10:00:00Z',
        replicationLagMs: 30,
        status: 'synced',
      });

      const convStatus = await repo.listReplicationStatus(tenantId, 'conversation');
      expect(convStatus).toHaveLength(1);

      const all = await repo.listReplicationStatus(tenantId);
      expect(all).toHaveLength(2);
    });
  });

  describe('Data Residency Audit', () => {
    it('should create audit entry', async () => {
      const audit = await repo.createResidencyAudit(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        entityType: 'conversation',
        entityId: 'conv-123',
        action: 'create',
        complianceCheckPassed: true,
        violationReason: null,
        performedBy: 'user-1',
        performedAt: '2026-01-15T10:00:00Z',
      });

      expect(audit.id).toBeDefined();
      expect(audit.complianceCheckPassed).toBe(true);
    });

    it('should list audit entries by entity', async () => {
      await repo.createResidencyAudit(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        entityType: 'conversation',
        entityId: 'conv-123',
        action: 'create',
        complianceCheckPassed: true,
        violationReason: null,
        performedBy: 'user-1',
        performedAt: '2026-01-15T10:00:00Z',
      });

      await repo.createResidencyAudit(tenantId, {
        tenantId,
        region: 'ap-southeast-1',
        entityType: 'conversation',
        entityId: 'conv-123',
        action: 'replicate',
        complianceCheckPassed: true,
        violationReason: null,
        performedBy: 'system',
        performedAt: '2026-01-15T10:01:00Z',
      });

      const audit = await repo.listResidencyAudit(tenantId, 'conversation', 'conv-123');
      expect(audit).toHaveLength(2);
    });

    it('should record compliance violations', async () => {
      const audit = await repo.createResidencyAudit(tenantId, {
        tenantId,
        region: 'eu-west-1',
        entityType: 'payment',
        entityId: 'pay-789',
        action: 'replicate',
        complianceCheckPassed: false,
        violationReason: 'Payment data cannot leave EU region',
        performedBy: 'system',
        performedAt: '2026-01-15T10:00:00Z',
      });

      expect(audit.complianceCheckPassed).toBe(false);
      expect(audit.violationReason).toBe('Payment data cannot leave EU region');
    });
  });
});
