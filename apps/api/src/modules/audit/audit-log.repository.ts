import { Inject, Injectable } from '@nestjs/common';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';
import type { AuditLog, AuditLogFilters } from '@chai/domain';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';

interface AuditLogRow {
  id: string;
  tenant_id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

@Injectable()
export class AuditLogRepository {
  constructor(@Inject(DATABASE) private readonly database: Database | null) {}

  async queryAuditLogs(
    tenantId: string,
    filters: AuditLogFilters,
  ): Promise<AuditLog[]> {
    if (!this.database) {
      return [];
    }

    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;

        // Build dynamic query using postgres helpers
        const rows = await tx<AuditLogRow[]>`
          SELECT id, tenant_id, actor_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at
          FROM chai.audit_log
          WHERE 1=1
          ${filters.actorId ? tx`AND actor_id = ${filters.actorId}` : tx``}
          ${filters.action ? tx`AND action = ${filters.action}` : tx``}
          ${filters.resourceType ? tx`AND resource_type = ${filters.resourceType}` : tx``}
          ${filters.resourceId ? tx`AND resource_id = ${filters.resourceId}` : tx``}
          ${filters.startDate ? tx`AND created_at >= ${filters.startDate}` : tx``}
          ${filters.endDate ? tx`AND created_at <= ${filters.endDate}` : tx``}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        return rows.map((row) => this.mapRow(row));
      },
    );
  }

  async getAuditLogById(
    tenantId: string,
    id: string,
  ): Promise<AuditLog | null> {
    if (!this.database) {
      return null;
    }

    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<AuditLogRow[]>`
          SELECT id, tenant_id, actor_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at
          FROM chai.audit_log
          WHERE id = ${id}
          LIMIT 1
        `;
        return rows[0] ? this.mapRow(rows[0]) : null;
      },
    );
  }

  private mapRow(row: AuditLogRow): AuditLog {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id ?? undefined,
      metadata: row.metadata ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      createdAt: row.created_at,
    };
  }
}
