import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  ImpersonationRepository,
  type ImpersonationAuditLog,
  type ImpersonationSession,
} from './impersonation.repository';

/** Bentuk baris public.impersonation_sessions. */
interface ImpersonationSessionRow {
  approved_at: Date | null;
  approved_by: string | null;
  created_at: Date;
  ended_at: Date | null;
  impersonated_user_id: string;
  impersonator_id: string;
  ip_address: string | null;
  id: string;
  max_duration_minutes: number;
  reason: string;
  requires_approval: boolean;
  started_at: Date;
  status: ImpersonationSession['status'];
  tenant_id: string;
  user_agent: string | null;
}

/** Bentuk baris public.impersonation_audit_log — tanpa kolom tenant_id (child table). */
interface ImpersonationAuditLogRow {
  action: string;
  created_at: Date;
  details: unknown | null;
  id: string;
  impersonation_session_id: string;
  resource_id: string | null;
  resource_type: string | null;
}

@Injectable()
export class PostgresImpersonationRepository extends ImpersonationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listSessions(
    tenantId: string,
    status?: string,
  ): Promise<ImpersonationSession[]> {
    const filter = status ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ImpersonationSessionRow[]>`
        SELECT * FROM public.impersonation_sessions
        WHERE tenant_id = ${tenantId}
          AND (${filter}::text IS NULL OR status = ${filter}::text)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapSession(row));
    });
  }

  override async getSession(
    tenantId: string,
    id: string,
  ): Promise<ImpersonationSession | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ImpersonationSessionRow[]>`
        SELECT * FROM public.impersonation_sessions
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapSession(rows[0]) : null;
    });
  }

  override async createSession(
    session: Omit<ImpersonationSession, 'id' | 'createdAt' | 'endedAt'>,
  ): Promise<ImpersonationSession> {
    const id = randomUUID();
    return this.tx(session.tenantId, async (tx) => {
      const rows = await tx<ImpersonationSessionRow[]>`
        INSERT INTO public.impersonation_sessions (
          id, tenant_id, impersonator_id, impersonated_user_id, reason,
          started_at, status, ip_address, user_agent, max_duration_minutes,
          requires_approval, approved_by, approved_at
        ) VALUES (
          ${id}, ${session.tenantId}, ${session.impersonatorId},
          ${session.impersonatedUserId}, ${session.reason},
          ${session.startedAt}::timestamptz, ${session.status},
          ${session.ipAddress}::inet, ${session.userAgent},
          ${session.maxDurationMinutes}, ${session.requiresApproval},
          ${session.approvedBy}, ${session.approvedAt}::timestamptz
        )
        RETURNING *
      `;
      return mapSession(requireRow(rows));
    });
  }

  override async updateSession(
    tenantId: string,
    id: string,
    update: Partial<ImpersonationSession>,
  ): Promise<ImpersonationSession> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadSession(tx, tenantId, id);
      if (!existing) throw new Error('Impersonation session not found');
      const merged = { ...existing, ...update };
      const rows = await tx<ImpersonationSessionRow[]>`
        UPDATE public.impersonation_sessions SET
          impersonator_id = ${merged.impersonatorId},
          impersonated_user_id = ${merged.impersonatedUserId},
          reason = ${merged.reason},
          started_at = ${merged.startedAt}::timestamptz,
          ended_at = ${merged.endedAt}::timestamptz,
          status = ${merged.status},
          ip_address = ${merged.ipAddress}::inet,
          user_agent = ${merged.userAgent},
          max_duration_minutes = ${merged.maxDurationMinutes},
          requires_approval = ${merged.requiresApproval},
          approved_by = ${merged.approvedBy},
          approved_at = ${merged.approvedAt}::timestamptz
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapSession(requireRow(rows));
    });
  }

  override async listAuditLogs(
    tenantId: string,
    sessionId: string,
  ): Promise<ImpersonationAuditLog[]> {
    return this.tx(tenantId, async (tx) => {
      // impersonation_audit_log's tenant_isolation policy (0040) is enforced
      // through the parent impersonation_sessions row (EXISTS ... tenant_id =
      // current_tenant_id()), so no explicit tenant filter is written here.
      const rows = await tx<ImpersonationAuditLogRow[]>`
        SELECT * FROM public.impersonation_audit_log
        WHERE impersonation_session_id = ${sessionId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapAuditLog(row));
    });
  }

  override async createAuditLog(
    tenantId: string,
    log: Omit<ImpersonationAuditLog, 'id' | 'createdAt'>,
  ): Promise<ImpersonationAuditLog> {
    const id = randomUUID();
    const details = JSON.stringify(log.details);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ImpersonationAuditLogRow[]>`
        INSERT INTO public.impersonation_audit_log (
          id, impersonation_session_id, action, resource_type, resource_id, details
        ) VALUES (
          ${id}, ${log.impersonationSessionId}, ${log.action}, ${log.resourceType},
          ${log.resourceId}::uuid, ${details}::jsonb
        )
        RETURNING *
      `;
      return mapAuditLog(requireRow(rows));
    });
  }

  private async loadSession(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<ImpersonationSession | null> {
    const rows = await tx<ImpersonationSessionRow[]>`
      SELECT * FROM public.impersonation_sessions
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapSession(rows[0]) : null;
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

function mapSession(row: ImpersonationSessionRow): ImpersonationSession {
  return {
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    approvedBy: row.approved_by,
    createdAt: row.created_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    id: row.id,
    impersonatedUserId: row.impersonated_user_id,
    impersonatorId: row.impersonator_id,
    ipAddress: row.ip_address,
    maxDurationMinutes: row.max_duration_minutes,
    reason: row.reason,
    requiresApproval: row.requires_approval,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tenantId: row.tenant_id,
    userAgent: row.user_agent,
  };
}

function mapAuditLog(row: ImpersonationAuditLogRow): ImpersonationAuditLog {
  return {
    action: row.action,
    createdAt: row.created_at.toISOString(),
    details: row.details === null ? {} : parseJson<Record<string, unknown>>(row.details),
    id: row.id,
    impersonationSessionId: row.impersonation_session_id,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
  };
}

/** Driver ini mengembalikan jsonb sebagai string; objek dilewatkan apa adanya. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

/** Baris pertama hasil RETURNING, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
