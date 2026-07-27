import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  MultiRegionRepository,
  type DataResidencyAudit,
  type RegionReplicationStatus,
  type RegionRoutingRule,
  type TenantRegion,
} from './multi-region.repository';

/** Bentuk baris chai.tenant_region. */
interface TenantRegionRow {
  created_at: Date;
  data_residency_policy: string;
  id: string;
  is_primary: boolean;
  region: string;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.region_routing_rule. */
interface RegionRoutingRuleRow {
  created_at: Date;
  id: string;
  is_active: boolean;
  priority: number;
  routing_type: RegionRoutingRule['routingType'];
  source_region: string;
  target_region: string;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.region_replication_status. */
interface RegionReplicationStatusRow {
  created_at: Date;
  entity_id: string;
  entity_type: string;
  id: string;
  last_replicated_at: Date | null;
  replication_lag_ms: number | null;
  source_region: string;
  status: RegionReplicationStatus['status'];
  target_region: string;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.data_residency_audit. */
interface DataResidencyAuditRow {
  action: DataResidencyAudit['action'];
  compliance_check_passed: boolean;
  entity_id: string;
  entity_type: string;
  id: string;
  performed_at: Date;
  performed_by: string;
  region: string;
  tenant_id: string;
  violation_reason: string | null;
}

@Injectable()
export class PostgresMultiRegionRepository extends MultiRegionRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listTenantRegions(tenantId: string): Promise<TenantRegion[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TenantRegionRow[]>`
        SELECT * FROM chai.tenant_region
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapTenantRegion(row));
    });
  }

  override async getTenantRegion(
    tenantId: string,
    region: string,
  ): Promise<TenantRegion | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TenantRegionRow[]>`
        SELECT * FROM chai.tenant_region
        WHERE tenant_id = ${tenantId} AND region = ${region}
        LIMIT 1
      `;
      return rows[0] ? mapTenantRegion(rows[0]) : null;
    });
  }

  override async createTenantRegion(
    tenantId: string,
    region: Omit<TenantRegion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantRegion> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TenantRegionRow[]>`
        INSERT INTO chai.tenant_region (
          id, tenant_id, region, is_primary, data_residency_policy
        ) VALUES (
          ${id}, ${tenantId}, ${region.region}, ${region.isPrimary},
          ${region.dataResidencyPolicy}
        )
        RETURNING *
      `;
      return mapTenantRegion(requireRow(rows));
    });
  }

  override async updateTenantRegion(
    tenantId: string,
    id: string,
    update: Partial<TenantRegion>,
  ): Promise<TenantRegion> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadTenantRegion(tx, tenantId, id);
      if (!existing) throw new Error('Tenant region not found');
      const merged = { ...existing, ...update };
      const rows = await tx<TenantRegionRow[]>`
        UPDATE chai.tenant_region SET
          region = ${merged.region},
          is_primary = ${merged.isPrimary},
          data_residency_policy = ${merged.dataResidencyPolicy},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapTenantRegion(requireRow(rows));
    });
  }

  override async deleteTenantRegion(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.tenant_region
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Tenant region not found');
    });
  }

  override async listRoutingRules(tenantId: string): Promise<RegionRoutingRule[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RegionRoutingRuleRow[]>`
        SELECT * FROM chai.region_routing_rule
        WHERE tenant_id = ${tenantId}
        ORDER BY priority ASC, created_at DESC
      `;
      return rows.map((row) => mapRoutingRule(row));
    });
  }

  override async createRoutingRule(
    tenantId: string,
    rule: Omit<RegionRoutingRule, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<RegionRoutingRule> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RegionRoutingRuleRow[]>`
        INSERT INTO chai.region_routing_rule (
          id, tenant_id, source_region, target_region, routing_type, priority, is_active
        ) VALUES (
          ${id}, ${tenantId}, ${rule.sourceRegion}, ${rule.targetRegion},
          ${rule.routingType}, ${rule.priority}, ${rule.isActive}
        )
        RETURNING *
      `;
      return mapRoutingRule(requireRow(rows));
    });
  }

  override async updateRoutingRule(
    tenantId: string,
    id: string,
    update: Partial<RegionRoutingRule>,
  ): Promise<RegionRoutingRule> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadRoutingRule(tx, tenantId, id);
      if (!existing) throw new Error('Routing rule not found');
      const merged = { ...existing, ...update };
      const rows = await tx<RegionRoutingRuleRow[]>`
        UPDATE chai.region_routing_rule SET
          source_region = ${merged.sourceRegion},
          target_region = ${merged.targetRegion},
          routing_type = ${merged.routingType},
          priority = ${merged.priority},
          is_active = ${merged.isActive},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapRoutingRule(requireRow(rows));
    });
  }

  override async deleteRoutingRule(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.region_routing_rule
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Routing rule not found');
    });
  }

  override async listReplicationStatus(
    tenantId: string,
    entityType?: string,
    entityId?: string,
  ): Promise<RegionReplicationStatus[]> {
    const entityTypeFilter = entityType ?? null;
    const entityIdFilter = entityId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RegionReplicationStatusRow[]>`
        SELECT * FROM chai.region_replication_status
        WHERE tenant_id = ${tenantId}
          AND (${entityTypeFilter}::text IS NULL OR entity_type = ${entityTypeFilter}::text)
          AND (${entityIdFilter}::text IS NULL OR entity_id = ${entityIdFilter}::text)
        ORDER BY updated_at DESC
      `;
      return rows.map((row) => mapReplicationStatus(row));
    });
  }

  override async upsertReplicationStatus(
    tenantId: string,
    status: Omit<RegionReplicationStatus, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<RegionReplicationStatus> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RegionReplicationStatusRow[]>`
        INSERT INTO chai.region_replication_status (
          id, tenant_id, source_region, target_region, entity_type, entity_id,
          last_replicated_at, replication_lag_ms, status
        ) VALUES (
          ${id}, ${tenantId}, ${status.sourceRegion}, ${status.targetRegion},
          ${status.entityType}, ${status.entityId},
          ${status.lastReplicatedAt}::timestamptz, ${status.replicationLagMs},
          ${status.status}
        )
        ON CONFLICT (tenant_id, source_region, target_region, entity_type, entity_id)
        DO UPDATE SET
          last_replicated_at = EXCLUDED.last_replicated_at,
          replication_lag_ms = EXCLUDED.replication_lag_ms,
          status = EXCLUDED.status,
          updated_at = now()
        RETURNING *
      `;
      return mapReplicationStatus(requireRow(rows));
    });
  }

  override async listResidencyAudit(
    tenantId: string,
    entityType?: string,
    entityId?: string,
  ): Promise<DataResidencyAudit[]> {
    const entityTypeFilter = entityType ?? null;
    const entityIdFilter = entityId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<DataResidencyAuditRow[]>`
        SELECT * FROM chai.data_residency_audit
        WHERE tenant_id = ${tenantId}
          AND (${entityTypeFilter}::text IS NULL OR entity_type = ${entityTypeFilter}::text)
          AND (${entityIdFilter}::text IS NULL OR entity_id = ${entityIdFilter}::text)
        ORDER BY performed_at DESC
      `;
      return rows.map((row) => mapResidencyAudit(row));
    });
  }

  override async createResidencyAudit(
    tenantId: string,
    audit: Omit<DataResidencyAudit, 'id'>,
  ): Promise<DataResidencyAudit> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<DataResidencyAuditRow[]>`
        INSERT INTO chai.data_residency_audit (
          id, tenant_id, region, entity_type, entity_id, action,
          compliance_check_passed, violation_reason, performed_by, performed_at
        ) VALUES (
          ${id}, ${tenantId}, ${audit.region}, ${audit.entityType}, ${audit.entityId},
          ${audit.action}, ${audit.complianceCheckPassed}, ${audit.violationReason},
          ${audit.performedBy}, ${audit.performedAt}::timestamptz
        )
        RETURNING *
      `;
      return mapResidencyAudit(requireRow(rows));
    });
  }

  private async loadTenantRegion(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<TenantRegion | null> {
    const rows = await tx<TenantRegionRow[]>`
      SELECT * FROM chai.tenant_region
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapTenantRegion(rows[0]) : null;
  }

  private async loadRoutingRule(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<RegionRoutingRule | null> {
    const rows = await tx<RegionRoutingRuleRow[]>`
      SELECT * FROM chai.region_routing_rule
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapRoutingRule(rows[0]) : null;
  }

  private tx<T>(
    tenantId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      work,
    );
  }
}

function mapTenantRegion(row: TenantRegionRow): TenantRegion {
  return {
    createdAt: row.created_at.toISOString(),
    dataResidencyPolicy: row.data_residency_policy,
    id: row.id,
    isPrimary: row.is_primary,
    region: row.region,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRoutingRule(row: RegionRoutingRuleRow): RegionRoutingRule {
  return {
    createdAt: row.created_at.toISOString(),
    id: row.id,
    isActive: row.is_active,
    priority: row.priority,
    routingType: row.routing_type,
    sourceRegion: row.source_region,
    targetRegion: row.target_region,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapReplicationStatus(row: RegionReplicationStatusRow): RegionReplicationStatus {
  return {
    createdAt: row.created_at.toISOString(),
    entityId: row.entity_id,
    entityType: row.entity_type,
    id: row.id,
    lastReplicatedAt: row.last_replicated_at ? row.last_replicated_at.toISOString() : null,
    replicationLagMs: row.replication_lag_ms,
    sourceRegion: row.source_region,
    status: row.status,
    targetRegion: row.target_region,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapResidencyAudit(row: DataResidencyAuditRow): DataResidencyAudit {
  return {
    action: row.action,
    complianceCheckPassed: row.compliance_check_passed,
    entityId: row.entity_id,
    entityType: row.entity_type,
    id: row.id,
    performedAt: row.performed_at.toISOString(),
    performedBy: row.performed_by,
    region: row.region,
    tenantId: row.tenant_id,
    violationReason: row.violation_reason,
  };
}

/** Baris pertama hasil RETURNING, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
