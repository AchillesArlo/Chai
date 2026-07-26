import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';
import {
  createVersion,
  listVersions,
  publishVersion,
  type FlowVersionRecord,
} from '@chai/domain';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';

export type AutomationFlowStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'ARCHIVED';

export interface AutomationFlowRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: AutomationFlowStatus;
  version: number;
  definition: unknown;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationRecord {
  id: string;
  flowId: string;
  version: number | null;
  input: unknown;
  output: unknown;
  status: string;
  createdAt: string;
}

export abstract class AutomationBuilderRepository {
  abstract listFlows(tenantId: string): Promise<AutomationFlowRecord[]>;
  abstract getFlow(tenantId: string, id: string): Promise<AutomationFlowRecord | null>;
  abstract createFlow(
    tenantId: string,
    input: { name: string; description?: string; definition?: unknown; createdBy?: string },
  ): Promise<AutomationFlowRecord>;
  abstract updateFlow(
    tenantId: string,
    id: string,
    input: { name?: string; description?: string; definition?: unknown },
  ): Promise<AutomationFlowRecord>;
  abstract simulate(
    tenantId: string,
    flowId: string,
    input: { version?: number; input?: unknown; output?: unknown; status?: string },
  ): Promise<SimulationRecord>;
  abstract publish(
    tenantId: string,
    flowId: string,
    publishedBy: string,
  ): Promise<{ flow: AutomationFlowRecord; version: FlowVersionRecord }>;
  abstract listVersions(tenantId: string, flowId: string): Promise<FlowVersionRecord[]>;
}

interface FlowRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: AutomationFlowStatus;
  version: number;
  definition: unknown;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface SimRow {
  id: string;
  flow_id: string;
  version: number | null;
  input: unknown;
  output: unknown;
  status: string;
  created_at: Date;
}

function toFlowRecord(row: FlowRow): AutomationFlowRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    status: row.status,
    version: row.version,
    definition: row.definition,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toSimRecord(row: SimRow): SimulationRecord {
  return {
    id: row.id,
    flowId: row.flow_id,
    version: row.version,
    input: row.input,
    output: row.output,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class InMemoryAutomationBuilderRepository extends AutomationBuilderRepository {
  private readonly flows = new Map<string, AutomationFlowRecord>();
  private readonly sims = new Map<string, SimulationRecord>();
  private readonly versions = new Map<string, FlowVersionRecord>();

  override async listFlows(tenantId: string): Promise<AutomationFlowRecord[]> {
    return [...this.flows.values()].filter((f) => f.tenantId === tenantId);
  }

  override async getFlow(tenantId: string, id: string): Promise<AutomationFlowRecord | null> {
    const flow = this.flows.get(id);
    return flow && flow.tenantId === tenantId ? flow : null;
  }

  override async createFlow(
    tenantId: string,
    input: { name: string; description?: string; definition?: unknown; createdBy?: string },
  ): Promise<AutomationFlowRecord> {
    const now = new Date().toISOString();
    const record: AutomationFlowRecord = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description ?? null,
      status: 'DRAFT',
      version: 1,
      definition: input.definition ?? { nodes: [], edges: [] },
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.flows.set(record.id, record);
    return record;
  }

  override async updateFlow(
    tenantId: string,
    id: string,
    input: { name?: string; description?: string; definition?: unknown },
  ): Promise<AutomationFlowRecord> {
    const existing = await this.getFlow(tenantId, id);
    if (!existing) throw new Error('flow not found');
    const updated: AutomationFlowRecord = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      definition: input.definition ?? existing.definition,
      updatedAt: new Date().toISOString(),
    };
    this.flows.set(id, updated);
    return updated;
  }

  override async simulate(
    tenantId: string,
    flowId: string,
    input: { version?: number; input?: unknown; output?: unknown; status?: string },
  ): Promise<SimulationRecord> {
    const flow = await this.getFlow(tenantId, flowId);
    if (!flow) throw new Error('flow not found');
    const record: SimulationRecord = {
      id: randomUUID(),
      flowId,
      version: input.version ?? flow.version,
      input: input.input ?? null,
      output: input.output ?? null,
      status: input.status ?? 'COMPLETED',
      createdAt: new Date().toISOString(),
    };
    this.sims.set(record.id, record);
    return record;
  }

  override async publish(
    tenantId: string,
    flowId: string,
    publishedBy: string,
  ): Promise<{ flow: AutomationFlowRecord; version: FlowVersionRecord }> {
    const flow = await this.getFlow(tenantId, flowId);
    if (!flow) throw new Error('flow not found');
    const version: FlowVersionRecord = {
      id: randomUUID(),
      flowId,
      version: flow.version + 1,
      definition: flow.definition as never,
      changeLog: null,
      publishedAt: new Date().toISOString(),
      publishedBy,
      createdAt: new Date().toISOString(),
    };
    this.versions.set(version.id, version);
    const updated: AutomationFlowRecord = {
      ...flow,
      status: 'ACTIVE',
      version: version.version,
      updatedAt: new Date().toISOString(),
    };
    this.flows.set(flowId, updated);
    return { flow: updated, version };
  }

  override async listVersions(tenantId: string, flowId: string): Promise<FlowVersionRecord[]> {
    const flow = await this.getFlow(tenantId, flowId);
    if (!flow) return [];
    return [...this.versions.values()]
      .filter((v) => v.flowId === flowId)
      .sort((a, b) => b.version - a.version);
  }
}

@Injectable()
export class PostgresAutomationBuilderRepository extends AutomationBuilderRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listFlows(tenantId: string): Promise<AutomationFlowRecord[]> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<FlowRow[]>`
        SELECT id, tenant_id, name, description, status, version, definition, created_by, created_at, updated_at
          FROM chai.automation_flow
          WHERE tenant_id = ${tenantId}::uuid
          ORDER BY updated_at DESC
      `;
      return rows.map(toFlowRecord);
    });
  }

  override async getFlow(tenantId: string, id: string): Promise<AutomationFlowRecord | null> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<FlowRow[]>`
        SELECT id, tenant_id, name, description, status, version, definition, created_by, created_at, updated_at
          FROM chai.automation_flow
          WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      `;
      return rows[0] ? toFlowRecord(rows[0]) : null;
    });
  }

  override async createFlow(
    tenantId: string,
    input: { name: string; description?: string; definition?: unknown; createdBy?: string },
  ): Promise<AutomationFlowRecord> {
    const id = randomUUID();
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<FlowRow[]>`
        INSERT INTO chai.automation_flow (id, tenant_id, name, description, definition, created_by)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${input.name}, ${input.description ?? null}, ${JSON.stringify(input.definition ?? { nodes: [], edges: [] })}::jsonb, ${input.createdBy ?? null}::uuid)
        RETURNING id, tenant_id, name, description, status, version, definition, created_by, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new Error('automation_flow insert returned no row');
      return toFlowRecord(row);
    });
  }

  override async updateFlow(
    tenantId: string,
    id: string,
    input: { name?: string; description?: string; definition?: unknown },
  ): Promise<AutomationFlowRecord> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<FlowRow[]>`
        UPDATE chai.automation_flow
          SET name = COALESCE(${input.name ?? null}, name),
              description = COALESCE(${input.description ?? null}, description),
              definition = COALESCE(${input.definition !== undefined ? JSON.stringify(input.definition) : null}::jsonb, definition),
              updated_at = now()
          WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
          RETURNING id, tenant_id, name, description, status, version, definition, created_by, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new Error('automation_flow update matched no row');
      return toFlowRecord(row);
    });
  }

  override async simulate(
    tenantId: string,
    flowId: string,
    input: { version?: number; input?: unknown; output?: unknown; status?: string },
  ): Promise<SimulationRecord> {
    const flow = await this.getFlow(tenantId, flowId);
    if (!flow) throw new Error('flow not found');
    const id = randomUUID();
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<SimRow[]>`
        INSERT INTO chai.automation_simulation (id, flow_id, version, input, output, status)
        VALUES (${id}::uuid, ${flowId}::uuid, ${input.version ?? flow.version}, ${JSON.stringify(input.input ?? null)}::jsonb, ${JSON.stringify(input.output ?? null)}::jsonb, ${input.status ?? 'COMPLETED'})
        RETURNING id, flow_id, version, input, output, status, created_at
      `;
      const row = rows[0];
      if (!row) throw new Error('automation_simulation insert returned no row');
      return toSimRecord(row);
    });
  }

  override async publish(
    tenantId: string,
    flowId: string,
    publishedBy: string,
  ): Promise<{ flow: AutomationFlowRecord; version: FlowVersionRecord }> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const flowRows = await tx<FlowRow[]>`
        SELECT id, tenant_id, name, description, status, version, definition, created_by, created_at, updated_at
          FROM chai.automation_flow
          WHERE tenant_id = ${tenantId}::uuid AND id = ${flowId}::uuid
      `;
      const flowRow = flowRows[0];
      if (!flowRow) throw new Error('flow not found');

      const version = await createVersion(tx, flowId, flowRow.definition as never, null);
      const published = await publishVersion(tx, flowId, version.version, publishedBy);

      const updatedRows = await tx<FlowRow[]>`
        SELECT id, tenant_id, name, description, status, version, definition, created_by, created_at, updated_at
          FROM chai.automation_flow
          WHERE tenant_id = ${tenantId}::uuid AND id = ${flowId}::uuid
      `;
      const updated = updatedRows[0];
      if (!updated) throw new Error('flow vanished after publish');
      return { flow: toFlowRecord(updated), version: published };
    });
  }

  override async listVersions(tenantId: string, flowId: string): Promise<FlowVersionRecord[]> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      return listVersions(tx, flowId);
    });
  }
}
