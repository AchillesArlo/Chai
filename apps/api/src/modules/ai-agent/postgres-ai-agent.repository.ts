import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  AIAgentRepository,
  type AgentProfile,
  type AgentSession,
  type ToolPolicy,
} from './ai-agent.repository';

interface AgentProfileRow {
  business_rules: unknown;
  created_at: Date;
  handover_policy: unknown;
  id: string;
  language: string;
  name: string;
  status: AgentProfile['status'];
  tenant_id: string;
  tone: string | null;
  updated_at: Date;
  use_case: string;
}

interface AgentSessionRow {
  agent_profile_id: string;
  context: unknown;
  conversation_id: string;
  created_at: Date;
  ended_at: Date | null;
  id: string;
  messages_count: number;
  started_at: Date;
  status: AgentSession['status'];
  tenant_id: string;
  updated_at: Date;
}

interface ToolPolicyRow {
  agent_profile_id: string | null;
  allowed: boolean;
  constraints: unknown;
  created_at: Date;
  id: string;
  tenant_id: string;
  tool_name: string;
  updated_at: Date;
}

@Injectable()
export class PostgresAIAgentRepository extends AIAgentRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listProfiles(tenantId: string): Promise<AgentProfile[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AgentProfileRow[]>`
        SELECT * FROM chai.agent_profile
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapProfile(row));
    });
  }

  override async getProfile(
    tenantId: string,
    id: string,
  ): Promise<AgentProfile | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AgentProfileRow[]>`
        SELECT * FROM chai.agent_profile
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapProfile(rows[0]) : null;
    });
  }

  override async createProfile(
    tenantId: string,
    profile: Omit<AgentProfile, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<AgentProfile> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AgentProfileRow[]>`
        INSERT INTO chai.agent_profile (
          id, tenant_id, name, use_case, status, tone, language,
          business_rules, handover_policy
        ) VALUES (
          ${id}, ${tenantId}, ${profile.name}, ${profile.useCase},
          ${profile.status}, ${profile.tone}, ${profile.language},
          ${tx.json(profile.businessRules as Parameters<typeof tx.json>[0])}::jsonb,
          ${tx.json(profile.handoverPolicy as Parameters<typeof tx.json>[0])}::jsonb
        )
        RETURNING *
      `;
      return mapProfile(requireRow(rows));
    });
  }

  override async updateProfile(
    tenantId: string,
    id: string,
    update: Partial<AgentProfile>,
  ): Promise<AgentProfile> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadProfile(tx, tenantId, id);
      if (!existing) throw new Error('Profile not found');
      const merged = { ...existing, ...update };
      const rows = await tx<AgentProfileRow[]>`
        UPDATE chai.agent_profile SET
          name = ${merged.name},
          use_case = ${merged.useCase},
          status = ${merged.status},
          tone = ${merged.tone},
          language = ${merged.language},
          business_rules = ${tx.json(merged.businessRules as Parameters<typeof tx.json>[0])}::jsonb,
          handover_policy = ${tx.json(merged.handoverPolicy as Parameters<typeof tx.json>[0])}::jsonb,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapProfile(requireRow(rows));
    });
  }

  override async deleteProfile(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.agent_profile
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Profile not found');
    });
  }

  override async listSessions(
    tenantId: string,
    agentProfileId?: string,
  ): Promise<AgentSession[]> {
    const filter = agentProfileId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AgentSessionRow[]>`
        SELECT * FROM chai.agent_session
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR agent_profile_id = ${filter}::uuid)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapSession(row));
    });
  }

  override async getSession(
    tenantId: string,
    id: string,
  ): Promise<AgentSession | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AgentSessionRow[]>`
        SELECT * FROM chai.agent_session
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapSession(rows[0]) : null;
    });
  }

  override async createSession(
    tenantId: string,
    session: Omit<
      AgentSession,
      | 'id'
      | 'tenantId'
      | 'createdAt'
      | 'updatedAt'
      | 'startedAt'
      | 'endedAt'
      | 'messagesCount'
    >,
  ): Promise<AgentSession> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AgentSessionRow[]>`
        INSERT INTO chai.agent_session (
          id, tenant_id, agent_profile_id, conversation_id, status, context
        ) VALUES (
          ${id}, ${tenantId}, ${session.agentProfileId},
          ${session.conversationId}, ${session.status},
          ${tx.json(session.context as Parameters<typeof tx.json>[0])}::jsonb
        )
        RETURNING *
      `;
      return mapSession(requireRow(rows));
    });
  }

  override async updateSession(
    tenantId: string,
    id: string,
    update: Partial<AgentSession>,
  ): Promise<AgentSession> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadSession(tx, tenantId, id);
      if (!existing) throw new Error('Session not found');
      const merged = { ...existing, ...update };
      const rows = await tx<AgentSessionRow[]>`
        UPDATE chai.agent_session SET
          status = ${merged.status},
          ended_at = ${merged.endedAt},
          messages_count = ${merged.messagesCount},
          context = ${tx.json(merged.context as Parameters<typeof tx.json>[0])}::jsonb,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapSession(requireRow(rows));
    });
  }

  override async listToolPolicies(
    tenantId: string,
    agentProfileId?: string,
  ): Promise<ToolPolicy[]> {
    const filter = agentProfileId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ToolPolicyRow[]>`
        SELECT * FROM chai.tool_policy
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR agent_profile_id = ${filter}::uuid)
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapToolPolicy(row));
    });
  }

  override async createToolPolicy(
    tenantId: string,
    policy: Omit<ToolPolicy, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<ToolPolicy> {
    const id = randomUUID();
    const toolName = policy.toolName ?? policy.name ?? '';
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ToolPolicyRow[]>`
        INSERT INTO chai.tool_policy (
          id, tenant_id, agent_profile_id, tool_name, allowed, constraints
        ) VALUES (
          ${id}, ${tenantId}, ${policy.agentProfileId ?? null},
          ${toolName}, ${policy.allowed},
          ${tx.json(policy.constraints as Parameters<typeof tx.json>[0])}::jsonb
        )
        RETURNING *
      `;
      return mapToolPolicy(requireRow(rows));
    });
  }

  override async updateToolPolicy(
    tenantId: string,
    id: string,
    update: Partial<ToolPolicy>,
  ): Promise<ToolPolicy> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadToolPolicy(tx, tenantId, id);
      if (!existing) throw new Error('Tool policy not found');
      const merged = { ...existing, ...update };
      const rows = await tx<ToolPolicyRow[]>`
        UPDATE chai.tool_policy SET
          agent_profile_id = ${merged.agentProfileId ?? null},
          tool_name = ${merged.toolName ?? ''},
          allowed = ${merged.allowed},
          constraints = ${tx.json(merged.constraints as Parameters<typeof tx.json>[0])}::jsonb,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapToolPolicy(requireRow(rows));
    });
  }

  override async deleteToolPolicy(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.tool_policy
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Tool policy not found');
    });
  }

  private async loadProfile(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<AgentProfile | null> {
    const rows = await tx<AgentProfileRow[]>`
      SELECT * FROM chai.agent_profile
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapProfile(rows[0]) : null;
  }

  private async loadSession(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<AgentSession | null> {
    const rows = await tx<AgentSessionRow[]>`
      SELECT * FROM chai.agent_session
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapSession(rows[0]) : null;
  }

  private async loadToolPolicy(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<ToolPolicy | null> {
    const rows = await tx<ToolPolicyRow[]>`
      SELECT * FROM chai.tool_policy
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapToolPolicy(rows[0]) : null;
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

function mapProfile(row: AgentProfileRow): AgentProfile {
  return {
    businessRules: parseJson<Record<string, unknown>>(row.business_rules),
    createdAt: row.created_at.toISOString(),
    handoverPolicy: parseJson<Record<string, unknown>>(row.handover_policy),
    id: row.id,
    language: row.language,
    name: row.name,
    status: row.status,
    tenantId: row.tenant_id,
    tone: row.tone,
    updatedAt: row.updated_at.toISOString(),
    useCase: row.use_case,
  };
}

function mapSession(row: AgentSessionRow): AgentSession {
  return {
    agentProfileId: row.agent_profile_id,
    context: parseJson<Record<string, unknown>>(row.context),
    conversationId: row.conversation_id,
    createdAt: row.created_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    id: row.id,
    messagesCount: row.messages_count,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapToolPolicy(row: ToolPolicyRow): ToolPolicy {
  return {
    agentProfileId: row.agent_profile_id,
    allowed: row.allowed,
    constraints: parseJson<Record<string, unknown>>(row.constraints),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    tenantId: row.tenant_id,
    toolName: row.tool_name,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Decode a jsonb column that this driver returns as a raw JSON string. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

/** First row of a RETURNING result, guarded to avoid a non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
