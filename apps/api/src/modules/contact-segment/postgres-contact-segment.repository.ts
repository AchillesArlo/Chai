import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { withTenantTransaction, type Database } from '@chai/database';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';
import {
  ContactSegmentRepository,
  type ContactSegment,
} from './contact-segment.repository';

interface ContactSegmentRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  filter_rules: unknown;
  member_count: number;
  created_at: Date;
  updated_at: Date;
}

// chai.contact_segment (0028) carries tenant_id + RLS FORCE (tenant_isolation
// policy in 0028), so every query runs inside withTenantTransaction and the
// runtime role (NOBYPASSRLS) can only ever touch the caller tenant's rows.
@Injectable()
export class PostgresContactSegmentRepository extends ContactSegmentRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listSegments(tenantId: string): Promise<ContactSegment[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<ContactSegmentRow[]>`
          SELECT id, tenant_id, name, description, filter_rules, member_count,
                 created_at, updated_at
          FROM chai.contact_segment
          WHERE tenant_id = ${tenantId}
          ORDER BY created_at DESC
        `;
        return rows.map((row) => this.mapRow(row));
      },
    );
  }

  override async getSegment(
    tenantId: string,
    id: string,
  ): Promise<ContactSegment | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<ContactSegmentRow[]>`
          SELECT id, tenant_id, name, description, filter_rules, member_count,
                 created_at, updated_at
          FROM chai.contact_segment
          WHERE tenant_id = ${tenantId} AND id = ${id}
          LIMIT 1
        `;
        const row = rows[0];
        return row ? this.mapRow(row) : null;
      },
    );
  }

  override async createSegment(
    tenantId: string,
    segment: Omit<ContactSegment, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>,
  ): Promise<ContactSegment> {
    const id = randomUUID();
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<ContactSegmentRow[]>`
          INSERT INTO chai.contact_segment
            (id, tenant_id, name, description, filter_rules, member_count)
          VALUES
            (${id}::uuid, ${tenantId}::uuid, ${segment.name},
             ${segment.description ?? null},
             ${JSON.stringify(segment.filterRules ?? {})}::jsonb, 0)
          RETURNING id, tenant_id, name, description, filter_rules, member_count,
                    created_at, updated_at
        `;
        const row = rows[0];
        if (!row) {
          throw new Error('contact_segment missing after insert');
        }
        return this.mapRow(row);
      },
    );
  }

  override async updateSegment(
    tenantId: string,
    id: string,
    update: Partial<ContactSegment>,
  ): Promise<ContactSegment> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const existingRows = await tx<ContactSegmentRow[]>`
          SELECT id, tenant_id, name, description, filter_rules, member_count,
                 created_at, updated_at
          FROM chai.contact_segment
          WHERE tenant_id = ${tenantId} AND id = ${id}
          LIMIT 1
        `;
        const existing = existingRows[0];
        if (!existing) {
          throw new Error('Segment not found');
        }
        // Merge mirrors the in-memory repo's { ...existing, ...update }: only the
        // fields present in the patch move, everything else stays put.
        const merged = { ...this.mapRow(existing), ...update };
        const rows = await tx<ContactSegmentRow[]>`
          UPDATE chai.contact_segment
          SET name = ${merged.name},
              description = ${merged.description ?? null},
              filter_rules = ${JSON.stringify(merged.filterRules ?? {})}::jsonb,
              member_count = ${merged.memberCount},
              updated_at = now()
          WHERE tenant_id = ${tenantId} AND id = ${id}
          RETURNING id, tenant_id, name, description, filter_rules, member_count,
                    created_at, updated_at
        `;
        const row = rows[0];
        if (!row) {
          throw new Error('Segment not found');
        }
        return this.mapRow(row);
      },
    );
  }

  override async deleteSegment(tenantId: string, id: string): Promise<void> {
    await withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<Array<{ id: string }>>`
          DELETE FROM chai.contact_segment
          WHERE tenant_id = ${tenantId} AND id = ${id}
          RETURNING id
        `;
        if (rows.length === 0) {
          throw new Error('Segment not found');
        }
      },
    );
  }

  private mapRow(row: ContactSegmentRow): ContactSegment {
    return {
      createdAt: row.created_at.toISOString(),
      description: row.description,
      filterRules: parseJson<Record<string, unknown>>(row.filter_rules),
      id: row.id,
      memberCount: row.member_count,
      name: row.name,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}


// postgres-js returns jsonb as a raw string here; parse on read, matching the
// convention in the other Postgres repositories (notification, campaign, ...).
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}