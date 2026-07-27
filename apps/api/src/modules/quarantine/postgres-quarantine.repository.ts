import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withPrincipalTransaction,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  QuarantineRepository,
  type QuarantineAccessLog,
  type QuarantineEntry,
} from './quarantine.repository';

/** Bentuk baris public.quarantine_entries. Beberapa kolom jsonb. */
interface QuarantineEntryRow {
  access_count: number;
  created_at: Date;
  id: string;
  last_accessed_at: Date | null;
  raw_payload: unknown;
  reason: string;
  redacted_payload: unknown | null;
  redaction_order: unknown | null;
  retention_until: Date;
  review_notes: string | null;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  source_identifier: string | null;
  source_type: QuarantineEntry['sourceType'];
  status: QuarantineEntry['status'];
  tenant_id: string | null;
  updated_at: Date;
}

/** Bentuk baris public.quarantine_access_log. */
interface QuarantineAccessLogRow {
  access_type: QuarantineAccessLog['accessType'];
  accessed_by: string;
  created_at: Date;
  id: string;
  ip_address: string | null;
  quarantine_entry_id: string;
  reason: string | null;
  user_agent: string | null;
}

@Injectable()
export class PostgresQuarantineRepository extends QuarantineRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listEntries(
    tenantId: string | null,
    status?: string,
  ): Promise<QuarantineEntry[]> {
    const statusFilter = status ?? null;
    if (tenantId === null) {
      // Tenant-less listing (unknown-tenant payloads only): no app.tenant_id
      // to set, and the owner_console_read_write policy from 0067 does not
      // apply to chai_app_runtime, so this reads only what tenant_isolation
      // permits chai_app_runtime to see with no tenant set -- rows with
      // tenant_id IS NULL never match `tenant_id = current_tenant_id()`
      // either, matching the documented limitation of that policy (0067).
      // ponytail: a genuinely tenant-less listing therefore currently returns
      // nothing over the runtime role; the owner console's list route always
      // passes a real tenantId today (see quarantine.controller.ts), so this
      // path is unused in practice. Upgrade path: extend the SECURITY DEFINER
      // approach in 0067 with a list-by-status function if this is needed.
      return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
        const rows = await tx<QuarantineEntryRow[]>`
          SELECT * FROM public.quarantine_entries
          WHERE tenant_id IS NULL
            AND (${statusFilter}::text IS NULL OR status = ${statusFilter}::text)
          ORDER BY created_at DESC
        `;
        return rows.map((row) => mapEntry(row));
      });
    }
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<QuarantineEntryRow[]>`
        SELECT * FROM public.quarantine_entries
        WHERE tenant_id = ${tenantId}
          AND (${statusFilter}::text IS NULL OR status = ${statusFilter}::text)
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapEntry(row));
    });
  }

  /**
   * By-id, any-tenant lookup for the owner console. Goes through the
   * chai.quarantine_get_entry SECURITY DEFINER function (migration 0067)
   * because the ordinary tenant_isolation policy cannot satisfy a by-id,
   * cross-tenant (and possibly tenant_id IS NULL) read for chai_app_runtime.
   */
  override async getEntry(id: string): Promise<QuarantineEntry | null> {
    return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
      const rows = await tx<QuarantineEntryRow[]>`
        SELECT * FROM chai.quarantine_get_entry(${id}::uuid)
      `;
      return rows[0] ? mapEntry(rows[0]) : null;
    });
  }

  override async createEntry(
    entry: Omit<QuarantineEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>,
  ): Promise<QuarantineEntry> {
    const id = randomUUID();
    const rawPayload = JSON.stringify(entry.rawPayload);
    const redactedPayload =
      entry.redactedPayload === null ? null : JSON.stringify(entry.redactedPayload);
    const redactionOrder =
      entry.redactionOrder === null ? null : JSON.stringify(entry.redactionOrder);
    if (entry.tenantId === null) {
      // A genuinely tenant-less INSERT cannot satisfy tenant_isolation's
      // WITH CHECK (tenant_id = chai.current_tenant_id()) either -- NULL never
      // equals current_tenant_id(), set or not. Goes through the same
      // SECURITY DEFINER path as the by-id operations (migration 0067).
      return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
        const rows = await tx<QuarantineEntryRow[]>`
          SELECT * FROM chai.quarantine_create_tenantless_entry(
            ${id}::uuid,
            ${entry.sourceType},
            ${entry.sourceIdentifier},
            ${rawPayload}::jsonb,
            ${redactedPayload}::jsonb,
            ${redactionOrder}::jsonb,
            ${entry.reason},
            ${entry.status},
            ${entry.reviewedBy}::uuid,
            ${entry.reviewedAt}::timestamptz,
            ${entry.reviewNotes},
            ${entry.retentionUntil}::timestamptz
          )
        `;
        return mapEntry(requireRow(rows));
      });
    }
    return this.tx(entry.tenantId, async (tx) => {
      const rows = await tx<QuarantineEntryRow[]>`
        INSERT INTO public.quarantine_entries (
          id, tenant_id, source_type, source_identifier, raw_payload,
          redacted_payload, redaction_order, reason, status, reviewed_by,
          reviewed_at, review_notes, retention_until
        ) VALUES (
          ${id}, ${entry.tenantId}, ${entry.sourceType}, ${entry.sourceIdentifier},
          ${rawPayload}::jsonb, ${redactedPayload}::jsonb, ${redactionOrder}::jsonb,
          ${entry.reason}, ${entry.status}, ${entry.reviewedBy},
          ${entry.reviewedAt}::timestamptz, ${entry.reviewNotes},
          ${entry.retentionUntil}::timestamptz
        )
        RETURNING *
      `;
      return mapEntry(requireRow(rows));
    });
  }

  override async updateEntry(
    id: string,
    update: Partial<QuarantineEntry>,
  ): Promise<QuarantineEntry> {
    return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
      const existingRows = await tx<QuarantineEntryRow[]>`
        SELECT * FROM chai.quarantine_get_entry(${id}::uuid)
      `;
      const existing = existingRows[0] ? mapEntry(existingRows[0]) : null;
      if (!existing) throw new Error('Quarantine entry not found');
      const merged = { ...existing, ...update };
      const redactedPayload =
        merged.redactedPayload === null ? null : JSON.stringify(merged.redactedPayload);
      const redactionOrder =
        merged.redactionOrder === null ? null : JSON.stringify(merged.redactionOrder);
      const rows = await tx<QuarantineEntryRow[]>`
        SELECT * FROM chai.quarantine_update_entry(
          ${id}::uuid,
          ${redactedPayload}::jsonb,
          ${redactionOrder}::jsonb,
          ${merged.retentionUntil}::timestamptz,
          ${merged.reviewedAt}::timestamptz,
          ${merged.reviewedBy}::uuid,
          ${merged.reviewNotes},
          ${merged.status},
          ${merged.accessCount},
          ${merged.lastAccessedAt}::timestamptz
        )
      `;
      return mapEntry(requireRow(rows));
    });
  }

  override async deleteEntry(id: string): Promise<void> {
    await withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
      const existingRows = await tx<QuarantineEntryRow[]>`
        SELECT * FROM chai.quarantine_get_entry(${id}::uuid)
      `;
      if (!existingRows[0]) throw new Error('Quarantine entry not found');
      await tx`SELECT chai.quarantine_delete_entry(${id}::uuid)`;
    });
  }

  override async logAccess(
    log: Omit<QuarantineAccessLog, 'id' | 'createdAt'>,
  ): Promise<QuarantineAccessLog> {
    return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
      const rows = await tx<QuarantineAccessLogRow[]>`
        SELECT * FROM chai.quarantine_log_access(
          ${log.quarantineEntryId}::uuid,
          ${log.accessedBy}::uuid,
          ${log.accessType},
          ${log.ipAddress}::inet,
          ${log.userAgent},
          ${log.reason}
        )
      `;
      return mapAccessLog(requireRow(rows));
    });
  }

  override async listAccessLogs(entryId: string): Promise<QuarantineAccessLog[]> {
    return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
      const rows = await tx<QuarantineAccessLogRow[]>`
        SELECT * FROM chai.quarantine_list_access_logs(${entryId}::uuid)
      `;
      return rows.map((row) => mapAccessLog(row));
    });
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

function mapEntry(row: QuarantineEntryRow): QuarantineEntry {
  return {
    accessCount: row.access_count,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    lastAccessedAt: row.last_accessed_at ? row.last_accessed_at.toISOString() : null,
    rawPayload: parseJson<Record<string, unknown>>(row.raw_payload),
    reason: row.reason,
    redactedPayload:
      row.redacted_payload === null
        ? null
        : parseJson<Record<string, unknown>>(row.redacted_payload),
    redactionOrder:
      row.redaction_order === null
        ? null
        : parseJson<Record<string, unknown>>(row.redaction_order),
    retentionUntil: row.retention_until.toISOString(),
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    reviewedBy: row.reviewed_by,
    reviewNotes: row.review_notes,
    sourceIdentifier: row.source_identifier,
    sourceType: row.source_type,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAccessLog(row: QuarantineAccessLogRow): QuarantineAccessLog {
  return {
    accessedBy: row.accessed_by,
    accessType: row.access_type,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    ipAddress: row.ip_address,
    quarantineEntryId: row.quarantine_entry_id,
    reason: row.reason,
    userAgent: row.user_agent,
  };
}

/** Driver ini mengembalikan jsonb sebagai string; objek dilewatkan apa adanya. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

/** Baris pertama hasil RETURNING/function call, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
