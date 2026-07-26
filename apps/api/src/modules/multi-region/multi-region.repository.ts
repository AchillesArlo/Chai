import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface TenantRegion {
  id: string;
  tenantId: string;
  region: string;
  isPrimary: boolean;
  dataResidencyPolicy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegionRoutingRule {
  id: string;
  tenantId: string;
  sourceRegion: string;
  targetRegion: string;
  routingType: 'latency' | 'cost' | 'compliance' | 'manual';
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegionReplicationStatus {
  id: string;
  tenantId: string;
  sourceRegion: string;
  targetRegion: string;
  entityType: string;
  entityId: string;
  lastReplicatedAt: string | null;
  replicationLagMs: number | null;
  status: 'synced' | 'lagging' | 'failed' | 'pending';
  createdAt: string;
  updatedAt: string;
}

export interface DataResidencyAudit {
  id: string;
  tenantId: string;
  region: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'replicate' | 'migrate';
  complianceCheckPassed: boolean;
  violationReason: string | null;
  performedBy: string;
  performedAt: string;
}

export abstract class MultiRegionRepository {
  abstract listTenantRegions(tenantId: string): Promise<TenantRegion[]>;
  abstract getTenantRegion(tenantId: string, region: string): Promise<TenantRegion | null>;
  abstract createTenantRegion(tenantId: string, region: Omit<TenantRegion, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantRegion>;
  abstract updateTenantRegion(tenantId: string, id: string, update: Partial<TenantRegion>): Promise<TenantRegion>;
  abstract deleteTenantRegion(tenantId: string, id: string): Promise<void>;

  abstract listRoutingRules(tenantId: string): Promise<RegionRoutingRule[]>;
  abstract createRoutingRule(tenantId: string, rule: Omit<RegionRoutingRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<RegionRoutingRule>;
  abstract updateRoutingRule(tenantId: string, id: string, update: Partial<RegionRoutingRule>): Promise<RegionRoutingRule>;
  abstract deleteRoutingRule(tenantId: string, id: string): Promise<void>;

  abstract listReplicationStatus(tenantId: string, entityType?: string, entityId?: string): Promise<RegionReplicationStatus[]>;
  abstract upsertReplicationStatus(tenantId: string, status: Omit<RegionReplicationStatus, 'id' | 'createdAt' | 'updatedAt'>): Promise<RegionReplicationStatus>;

  abstract listResidencyAudit(tenantId: string, entityType?: string, entityId?: string): Promise<DataResidencyAudit[]>;
  abstract createResidencyAudit(tenantId: string, audit: Omit<DataResidencyAudit, 'id'>): Promise<DataResidencyAudit>;
}

@Injectable()
export class InMemoryMultiRegionRepository extends MultiRegionRepository {
  private regions = new Map<string, TenantRegion>();
  private rules = new Map<string, RegionRoutingRule>();
  private replication = new Map<string, RegionReplicationStatus>();
  private audit = new Map<string, DataResidencyAudit>();

  async listTenantRegions(tenantId: string): Promise<TenantRegion[]> {
    return Array.from(this.regions.values()).filter(r => r.tenantId === tenantId);
  }

  async getTenantRegion(tenantId: string, region: string): Promise<TenantRegion | null> {
    return Array.from(this.regions.values()).find(r => r.tenantId === tenantId && r.region === region) || null;
  }

  async createTenantRegion(tenantId: string, region: Omit<TenantRegion, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantRegion> {
    const now = new Date().toISOString();
    const created = { ...region, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.regions.set(created.id, created);
    return created;
  }

  async updateTenantRegion(tenantId: string, id: string, update: Partial<TenantRegion>): Promise<TenantRegion> {
    const existing = this.regions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Tenant region not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.regions.set(id, updated);
    return updated;
  }

  async deleteTenantRegion(tenantId: string, id: string): Promise<void> {
    const existing = this.regions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Tenant region not found');
    this.regions.delete(id);
  }

  async listRoutingRules(tenantId: string): Promise<RegionRoutingRule[]> {
    return Array.from(this.rules.values()).filter(r => r.tenantId === tenantId);
  }

  async createRoutingRule(tenantId: string, rule: Omit<RegionRoutingRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<RegionRoutingRule> {
    const now = new Date().toISOString();
    const created = { ...rule, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.rules.set(created.id, created);
    return created;
  }

  async updateRoutingRule(tenantId: string, id: string, update: Partial<RegionRoutingRule>): Promise<RegionRoutingRule> {
    const existing = this.rules.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Routing rule not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.rules.set(id, updated);
    return updated;
  }

  async deleteRoutingRule(tenantId: string, id: string): Promise<void> {
    const existing = this.rules.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Routing rule not found');
    this.rules.delete(id);
  }

  async listReplicationStatus(tenantId: string, entityType?: string, entityId?: string): Promise<RegionReplicationStatus[]> {
    return Array.from(this.replication.values()).filter(
      r => r.tenantId === tenantId && (!entityType || r.entityType === entityType) && (!entityId || r.entityId === entityId)
    );
  }

  async upsertReplicationStatus(tenantId: string, status: Omit<RegionReplicationStatus, 'id' | 'createdAt' | 'updatedAt'>): Promise<RegionReplicationStatus> {
    const existing = Array.from(this.replication.values()).find(
      r => r.tenantId === tenantId && r.sourceRegion === status.sourceRegion && r.targetRegion === status.targetRegion && r.entityType === status.entityType && r.entityId === status.entityId
    );

    const now = new Date().toISOString();
    if (existing) {
      const updated = { ...existing, ...status, updatedAt: now };
      this.replication.set(existing.id, updated);
      return updated;
    }

    const created = { ...status, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.replication.set(created.id, created);
    return created;
  }

  async listResidencyAudit(tenantId: string, entityType?: string, entityId?: string): Promise<DataResidencyAudit[]> {
    return Array.from(this.audit.values()).filter(
      a => a.tenantId === tenantId && (!entityType || a.entityType === entityType) && (!entityId || a.entityId === entityId)
    );
  }

  async createResidencyAudit(tenantId: string, auditEntry: Omit<DataResidencyAudit, 'id'>): Promise<DataResidencyAudit> {
    const created = { ...auditEntry, tenantId, id: randomUUID() };
    this.audit.set(created.id, created);
    return created;
  }
}
