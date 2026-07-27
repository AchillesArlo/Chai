import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  SLARepository,
  type SLABreach,
  type SLADefinition,
} from './sla.repository';

interface SLADefinitionRow {
  created_at: Date;
  first_response_minutes: number;
  id: string;
  name: string;
  resolution_minutes: number;
  tenant_id: string;
  updated_at: Date;
}

interface SLABreachRow {
  breach_type: SLABreach['breachType'];
  breached_at: Date;
  created_at: Date;
  id: string;
  resolved_at: Date | null;
  sla_definition_id: string;
  tenant_id: string;
  ticket_id: string;
}

@Injectable()
export class PostgresSLARepository extends SLARepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listDefinitions(tenantId: string): Promise<SLADefinition[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<SLADefinitionRow[]>`
        SELECT * FROM chai.sla_definition
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapDefinition(row));
    });
  }

  override async getDefinition(
    tenantId: string,
    id: string,
  ): Promise<SLADefinition | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<SLADefinitionRow[]>`
        SELECT * FROM chai.sla_definition
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapDefinition(rows[0]) : null;
    });
  }

  override async createDefinition(
    tenantId: string,
    definition: Omit<SLADefinition, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<SLADefinition> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<SLADefinitionRow[]>`
        INSERT INTO chai.sla_definition (
          id, tenant_id, name, first_response_minutes, resolution_minutes
        ) VALUES (
          ${id}, ${tenantId}, ${definition.name},
          ${definition.firstResponseTime}, ${definition.resolutionTime}
        )
        RETURNING *
      `;
      return mapDefinition(requireRow(rows));
    });
  }

  override async updateDefinition(
    tenantId: string,
    id: string,
    update: Partial<SLADefinition>,
  ): Promise<SLADefinition> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadDefinition(tx, tenantId, id);
      if (!existing) throw new Error('SLA definition not found');
      const merged = { ...existing, ...update };
      const rows = await tx<SLADefinitionRow[]>`
        UPDATE chai.sla_definition SET
          name = ${merged.name},
          first_response_minutes = ${merged.firstResponseTime},
          resolution_minutes = ${merged.resolutionTime},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapDefinition(requireRow(rows));
    });
  }

  override async deleteDefinition(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.sla_definition
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('SLA definition not found');
    });
  }

  override async listBreaches(
    tenantId: string,
    ticketId?: string,
  ): Promise<SLABreach[]> {
    const filter = ticketId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<SLABreachRow[]>`
        SELECT * FROM chai.sla_breach
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR ticket_id = ${filter}::uuid)
        ORDER BY breached_at DESC
      `;
      return rows.map((row) => mapBreach(row));
    });
  }

  override async createBreach(
    tenantId: string,
    breach: Omit<SLABreach, 'id' | 'tenantId' | 'createdAt'>,
  ): Promise<SLABreach> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<SLABreachRow[]>`
        INSERT INTO chai.sla_breach (
          id, tenant_id, sla_definition_id, ticket_id, breach_type,
          breached_at, resolved_at
        ) VALUES (
          ${id}, ${tenantId}, ${breach.slaDefinitionId}, ${breach.ticketId},
          ${breach.breachType}, ${breach.breachedAt}::timestamptz,
          ${breach.resolvedAt}::timestamptz
        )
        RETURNING *
      `;
      return mapBreach(requireRow(rows));
    });
  }

  override async updateBreach(
    tenantId: string,
    id: string,
    update: Partial<SLABreach>,
  ): Promise<SLABreach> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadBreach(tx, tenantId, id);
      if (!existing) throw new Error('SLA breach not found');
      const merged = { ...existing, ...update };
      const rows = await tx<SLABreachRow[]>`
        UPDATE chai.sla_breach SET
          sla_definition_id = ${merged.slaDefinitionId},
          ticket_id = ${merged.ticketId},
          breach_type = ${merged.breachType},
          breached_at = ${merged.breachedAt}::timestamptz,
          resolved_at = ${merged.resolvedAt}::timestamptz
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapBreach(requireRow(rows));
    });
  }

  private async loadDefinition(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<SLADefinition | null> {
    const rows = await tx<SLADefinitionRow[]>`
      SELECT * FROM chai.sla_definition
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapDefinition(rows[0]) : null;
  }

  private async loadBreach(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<SLABreach | null> {
    const rows = await tx<SLABreachRow[]>`
      SELECT * FROM chai.sla_breach
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapBreach(rows[0]) : null;
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

function mapDefinition(row: SLADefinitionRow): SLADefinition {
  return {
    createdAt: row.created_at.toISOString(),
    firstResponseTime: row.first_response_minutes,
    id: row.id,
    name: row.name,
    resolutionTime: row.resolution_minutes,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBreach(row: SLABreachRow): SLABreach {
  return {
    breachType: row.breach_type,
    breachedAt: row.breached_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    slaDefinitionId: row.sla_definition_id,
    tenantId: row.tenant_id,
    ticketId: row.ticket_id,
  };
}


/** First row of a RETURNING result, guarded to avoid a non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}