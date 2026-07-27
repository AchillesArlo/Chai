import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  RetentionRepository,
  type RetentionJob,
  type RetentionPolicy,
} from './retention.repository';

/** Bentuk baris public.retention_policies. `exceptions` adalah jsonb. */
interface RetentionPolicyRow {
  cascade_delete: boolean;
  created_at: Date;
  data_class: string;
  deletion_method: RetentionPolicy['deletionMethod'];
  exceptions: unknown;
  id: string;
  retention_days: number;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris public.retention_jobs. */
interface RetentionJobRow {
  completed_at: Date | null;
  created_at: Date;
  data_class: string;
  error_message: string | null;
  id: string;
  records_archived: number;
  records_deleted: number;
  records_processed: number;
  started_at: Date;
  status: RetentionJob['status'];
  tenant_id: string;
}

@Injectable()
export class PostgresRetentionRepository extends RetentionRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listPolicies(tenantId: string): Promise<RetentionPolicy[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RetentionPolicyRow[]>`
        SELECT * FROM public.retention_policies
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapPolicy(row));
    });
  }

  override async getPolicy(
    tenantId: string,
    id: string,
  ): Promise<RetentionPolicy | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RetentionPolicyRow[]>`
        SELECT * FROM public.retention_policies
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapPolicy(rows[0]) : null;
    });
  }

  override async createPolicy(
    tenantId: string,
    policy: Omit<RetentionPolicy, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<RetentionPolicy> {
    const id = randomUUID();
    const exceptions = JSON.stringify(policy.exceptions);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RetentionPolicyRow[]>`
        INSERT INTO public.retention_policies (
          id, tenant_id, data_class, retention_days, deletion_method,
          cascade_delete, exceptions
        ) VALUES (
          ${id}, ${tenantId}, ${policy.dataClass}, ${policy.retentionDays},
          ${policy.deletionMethod}, ${policy.cascadeDelete}, ${exceptions}::jsonb
        )
        RETURNING *
      `;
      return mapPolicy(requireRow(rows));
    });
  }

  override async updatePolicy(
    tenantId: string,
    id: string,
    update: Partial<RetentionPolicy>,
  ): Promise<RetentionPolicy> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadPolicy(tx, tenantId, id);
      if (!existing) throw new Error('Retention policy not found');
      const merged = { ...existing, ...update };
      const exceptions = JSON.stringify(merged.exceptions);
      const rows = await tx<RetentionPolicyRow[]>`
        UPDATE public.retention_policies SET
          data_class = ${merged.dataClass},
          retention_days = ${merged.retentionDays},
          deletion_method = ${merged.deletionMethod},
          cascade_delete = ${merged.cascadeDelete},
          exceptions = ${exceptions}::jsonb,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapPolicy(requireRow(rows));
    });
  }

  override async deletePolicy(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM public.retention_policies
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Retention policy not found');
    });
  }

  override async listJobs(tenantId: string, status?: string): Promise<RetentionJob[]> {
    const filter = status ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RetentionJobRow[]>`
        SELECT * FROM public.retention_jobs
        WHERE tenant_id = ${tenantId}
          AND (${filter}::text IS NULL OR status = ${filter}::text)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapJob(row));
    });
  }

  override async getJob(tenantId: string, id: string): Promise<RetentionJob | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RetentionJobRow[]>`
        SELECT * FROM public.retention_jobs
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapJob(rows[0]) : null;
    });
  }

  override async createJob(
    job: Omit<RetentionJob, 'id' | 'createdAt' | 'completedAt' | 'recordsProcessed' | 'recordsDeleted' | 'recordsArchived'>,
  ): Promise<RetentionJob> {
    const id = randomUUID();
    return this.tx(job.tenantId, async (tx) => {
      const rows = await tx<RetentionJobRow[]>`
        INSERT INTO public.retention_jobs (
          id, tenant_id, data_class, started_at, status, error_message
        ) VALUES (
          ${id}, ${job.tenantId}, ${job.dataClass}, ${job.startedAt}::timestamptz,
          ${job.status}, ${job.errorMessage}
        )
        RETURNING *
      `;
      return mapJob(requireRow(rows));
    });
  }

  override async updateJob(
    tenantId: string,
    id: string,
    update: Partial<RetentionJob>,
  ): Promise<RetentionJob> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadJob(tx, tenantId, id);
      if (!existing) throw new Error('Retention job not found');
      const merged = { ...existing, ...update };
      const rows = await tx<RetentionJobRow[]>`
        UPDATE public.retention_jobs SET
          data_class = ${merged.dataClass},
          completed_at = ${merged.completedAt}::timestamptz,
          records_processed = ${merged.recordsProcessed},
          records_deleted = ${merged.recordsDeleted},
          records_archived = ${merged.recordsArchived},
          status = ${merged.status},
          error_message = ${merged.errorMessage}
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapJob(requireRow(rows));
    });
  }

  private async loadPolicy(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<RetentionPolicy | null> {
    const rows = await tx<RetentionPolicyRow[]>`
      SELECT * FROM public.retention_policies
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  private async loadJob(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<RetentionJob | null> {
    const rows = await tx<RetentionJobRow[]>`
      SELECT * FROM public.retention_jobs
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapJob(rows[0]) : null;
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

function mapPolicy(row: RetentionPolicyRow): RetentionPolicy {
  return {
    cascadeDelete: row.cascade_delete,
    createdAt: row.created_at.toISOString(),
    dataClass: row.data_class,
    deletionMethod: row.deletion_method,
    exceptions: parseJson<unknown[]>(row.exceptions),
    id: row.id,
    retentionDays: row.retention_days,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapJob(row: RetentionJobRow): RetentionJob {
  return {
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    dataClass: row.data_class,
    errorMessage: row.error_message,
    id: row.id,
    recordsArchived: row.records_archived,
    recordsDeleted: row.records_deleted,
    recordsProcessed: row.records_processed,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tenantId: row.tenant_id,
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
