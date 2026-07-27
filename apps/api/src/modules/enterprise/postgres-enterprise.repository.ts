import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  EnterpriseRepository,
  type AuditExportConfig,
  type AuditExportHistory,
  type CustomRole,
  type RoleAssignment,
  type ScimConfiguration,
  type SsoConfiguration,
} from './enterprise.repository';

/** Bentuk baris chai.sso_configuration. `attribute_mapping` adalah jsonb. */
interface SsoConfigurationRow {
  attribute_mapping: unknown;
  certificate: string;
  created_at: Date;
  enabled: boolean;
  entity_id: string;
  id: string;
  provider: SsoConfiguration['provider'];
  sso_url: string;
  tenant_id: string;
  updated_at: Date;
}

/**
 * Bentuk baris chai.scim_configuration. `auth_token_hash` adalah NOT NULL di
 * database tapi tidak diekspos oleh ScimConfiguration (kontrak tidak pernah
 * mengelola hashing token SCIM). ponytail: diisi placeholder kosong sampai
 * kontrak menambahkan alur token — batasnya: SCIM base URL tersimpan tapi
 * belum ada token asli yang bisa diverifikasi; jalur peningkatan adalah
 * menambah field authToken ke ScimConfiguration dan menghash di sini.
 */
interface ScimConfigurationRow {
  base_url: string;
  created_at: Date;
  group_sync_enabled: boolean;
  id: string;
  last_sync_at: Date | null;
  tenant_id: string;
  updated_at: Date;
  user_sync_enabled: boolean;
}

/** Bentuk baris chai.custom_role. `permissions` adalah jsonb. */
interface CustomRoleRow {
  created_at: Date;
  description: string | null;
  id: string;
  name: string;
  permissions: unknown;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.role_assignment. */
interface RoleAssignmentRow {
  assigned_at: Date;
  assigned_by: string;
  id: string;
  role_id: string;
  tenant_id: string;
  user_id: string;
}

/** Bentuk baris chai.audit_export_config. Dua kolom jsonb. */
interface AuditExportConfigRow {
  created_at: Date;
  destination_config: unknown;
  destination_type: AuditExportConfig['destinationType'];
  enabled: boolean;
  filter_criteria: unknown;
  id: string;
  last_export_at: Date | null;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.audit_export_history. */
interface AuditExportHistoryRow {
  completed_at: Date | null;
  config_id: string;
  created_at: Date;
  error_message: string | null;
  id: string;
  records_exported: number;
  started_at: Date;
  status: AuditExportHistory['status'];
  tenant_id: string;
}

const EMPTY_SCIM_AUTH_TOKEN_HASH = '';

@Injectable()
export class PostgresEnterpriseRepository extends EnterpriseRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async getSsoConfig(
    tenantId: string,
    provider: 'saml' | 'oidc',
  ): Promise<SsoConfiguration | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<SsoConfigurationRow[]>`
        SELECT * FROM chai.sso_configuration
        WHERE tenant_id = ${tenantId} AND provider = ${provider}
        LIMIT 1
      `;
      return rows[0] ? mapSso(rows[0]) : null;
    });
  }

  override async upsertSsoConfig(
    tenantId: string,
    config: Omit<SsoConfiguration, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SsoConfiguration> {
    const id = randomUUID();
    const attributeMapping = JSON.stringify(config.attributeMapping);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<SsoConfigurationRow[]>`
        INSERT INTO chai.sso_configuration (
          id, tenant_id, provider, entity_id, sso_url, certificate,
          attribute_mapping, enabled
        ) VALUES (
          ${id}, ${tenantId}, ${config.provider}, ${config.entityId},
          ${config.ssoUrl}, ${config.certificate}, ${attributeMapping}::jsonb,
          ${config.enabled}
        )
        ON CONFLICT (tenant_id, provider) DO UPDATE SET
          entity_id = EXCLUDED.entity_id,
          sso_url = EXCLUDED.sso_url,
          certificate = EXCLUDED.certificate,
          attribute_mapping = EXCLUDED.attribute_mapping,
          enabled = EXCLUDED.enabled,
          updated_at = now()
        RETURNING *
      `;
      return mapSso(requireRow(rows));
    });
  }

  override async getScimConfig(tenantId: string): Promise<ScimConfiguration | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ScimConfigurationRow[]>`
        SELECT * FROM chai.scim_configuration
        WHERE tenant_id = ${tenantId}
        LIMIT 1
      `;
      return rows[0] ? mapScim(rows[0]) : null;
    });
  }

  override async upsertScimConfig(
    tenantId: string,
    config: Omit<ScimConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncAt'>,
  ): Promise<ScimConfiguration> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ScimConfigurationRow[]>`
        INSERT INTO chai.scim_configuration (
          id, tenant_id, base_url, auth_token_hash, user_sync_enabled,
          group_sync_enabled
        ) VALUES (
          ${id}, ${tenantId}, ${config.baseUrl}, ${EMPTY_SCIM_AUTH_TOKEN_HASH},
          ${config.userSyncEnabled}, ${config.groupSyncEnabled}
        )
        ON CONFLICT (tenant_id) DO UPDATE SET
          base_url = EXCLUDED.base_url,
          user_sync_enabled = EXCLUDED.user_sync_enabled,
          group_sync_enabled = EXCLUDED.group_sync_enabled,
          updated_at = now()
        RETURNING *
      `;
      return mapScim(requireRow(rows));
    });
  }

  override async listRoles(tenantId: string): Promise<CustomRole[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CustomRoleRow[]>`
        SELECT * FROM chai.custom_role
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapRole(row));
    });
  }

  override async getRole(tenantId: string, id: string): Promise<CustomRole | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CustomRoleRow[]>`
        SELECT * FROM chai.custom_role
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapRole(rows[0]) : null;
    });
  }

  override async createRole(
    tenantId: string,
    role: Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomRole> {
    const id = randomUUID();
    const permissions = JSON.stringify(role.permissions);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CustomRoleRow[]>`
        INSERT INTO chai.custom_role (
          id, tenant_id, name, description, permissions
        ) VALUES (
          ${id}, ${tenantId}, ${role.name}, ${role.description}, ${permissions}::jsonb
        )
        RETURNING *
      `;
      return mapRole(requireRow(rows));
    });
  }

  override async updateRole(
    tenantId: string,
    id: string,
    update: Partial<CustomRole>,
  ): Promise<CustomRole> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadRole(tx, tenantId, id);
      if (!existing) throw new Error('Role not found');
      const merged = { ...existing, ...update };
      const permissions = JSON.stringify(merged.permissions);
      const rows = await tx<CustomRoleRow[]>`
        UPDATE chai.custom_role SET
          name = ${merged.name},
          description = ${merged.description},
          permissions = ${permissions}::jsonb,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapRole(requireRow(rows));
    });
  }

  override async deleteRole(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.custom_role
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Role not found');
    });
  }

  override async listRoleAssignments(
    tenantId: string,
    userId?: string,
  ): Promise<RoleAssignment[]> {
    const filter = userId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RoleAssignmentRow[]>`
        SELECT * FROM chai.role_assignment
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR user_id = ${filter}::uuid)
        ORDER BY assigned_at DESC
      `;
      return rows.map((row) => mapAssignment(row));
    });
  }

  override async assignRole(
    tenantId: string,
    userId: string,
    roleId: string,
    assignedBy: string,
  ): Promise<RoleAssignment> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RoleAssignmentRow[]>`
        INSERT INTO chai.role_assignment (
          id, tenant_id, user_id, role_id, assigned_by
        ) VALUES (
          ${id}, ${tenantId}, ${userId}, ${roleId}, ${assignedBy}
        )
        ON CONFLICT (tenant_id, user_id, role_id) DO UPDATE SET
          assigned_by = EXCLUDED.assigned_by,
          assigned_at = now()
        RETURNING *
      `;
      return mapAssignment(requireRow(rows));
    });
  }

  override async revokeRole(
    tenantId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      await tx`
        DELETE FROM chai.role_assignment
        WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND role_id = ${roleId}
      `;
    });
  }

  override async getAuditExportConfig(
    tenantId: string,
  ): Promise<AuditExportConfig | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AuditExportConfigRow[]>`
        SELECT * FROM chai.audit_export_config
        WHERE tenant_id = ${tenantId}
        LIMIT 1
      `;
      return rows[0] ? mapExportConfig(rows[0]) : null;
    });
  }

  override async upsertAuditExportConfig(
    tenantId: string,
    config: Omit<AuditExportConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastExportAt'>,
  ): Promise<AuditExportConfig> {
    const id = randomUUID();
    const destinationConfig = JSON.stringify(config.destinationConfig);
    const filterCriteria = JSON.stringify(config.filterCriteria);
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadFirstExportConfig(tx, tenantId);
      if (existing) {
        const rows = await tx<AuditExportConfigRow[]>`
          UPDATE chai.audit_export_config SET
            destination_type = ${config.destinationType},
            destination_config = ${destinationConfig}::jsonb,
            filter_criteria = ${filterCriteria}::jsonb,
            enabled = ${config.enabled},
            updated_at = now()
          WHERE tenant_id = ${tenantId} AND id = ${existing.id}
          RETURNING *
        `;
        return mapExportConfig(requireRow(rows));
      }
      const rows = await tx<AuditExportConfigRow[]>`
        INSERT INTO chai.audit_export_config (
          id, tenant_id, destination_type, destination_config, filter_criteria, enabled
        ) VALUES (
          ${id}, ${tenantId}, ${config.destinationType}, ${destinationConfig}::jsonb,
          ${filterCriteria}::jsonb, ${config.enabled}
        )
        RETURNING *
      `;
      return mapExportConfig(requireRow(rows));
    });
  }

  override async listAuditExportHistory(
    tenantId: string,
    configId?: string,
  ): Promise<AuditExportHistory[]> {
    const filter = configId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AuditExportHistoryRow[]>`
        SELECT * FROM chai.audit_export_history
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR config_id = ${filter}::uuid)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapExportHistory(row));
    });
  }

  override async createAuditExportHistory(
    tenantId: string,
    history: Omit<AuditExportHistory, 'id' | 'createdAt'>,
  ): Promise<AuditExportHistory> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AuditExportHistoryRow[]>`
        INSERT INTO chai.audit_export_history (
          id, tenant_id, config_id, status, records_exported, started_at,
          completed_at, error_message
        ) VALUES (
          ${id}, ${tenantId}, ${history.configId}, ${history.status},
          ${history.recordsExported}, ${history.startedAt}::timestamptz,
          ${history.completedAt}::timestamptz, ${history.errorMessage}
        )
        RETURNING *
      `;
      return mapExportHistory(requireRow(rows));
    });
  }

  override async updateAuditExportHistory(
    tenantId: string,
    id: string,
    update: Partial<AuditExportHistory>,
  ): Promise<AuditExportHistory> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadExportHistory(tx, tenantId, id);
      if (!existing) throw new Error('Export history not found');
      const merged = { ...existing, ...update };
      const rows = await tx<AuditExportHistoryRow[]>`
        UPDATE chai.audit_export_history SET
          status = ${merged.status},
          records_exported = ${merged.recordsExported},
          completed_at = ${merged.completedAt}::timestamptz,
          error_message = ${merged.errorMessage}
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapExportHistory(requireRow(rows));
    });
  }

  private async loadRole(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<CustomRole | null> {
    const rows = await tx<CustomRoleRow[]>`
      SELECT * FROM chai.custom_role
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapRole(rows[0]) : null;
  }

  private async loadFirstExportConfig(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<AuditExportConfig | null> {
    const rows = await tx<AuditExportConfigRow[]>`
      SELECT * FROM chai.audit_export_config
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `;
    return rows[0] ? mapExportConfig(rows[0]) : null;
  }

  private async loadExportHistory(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<AuditExportHistory | null> {
    const rows = await tx<AuditExportHistoryRow[]>`
      SELECT * FROM chai.audit_export_history
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapExportHistory(rows[0]) : null;
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

function mapSso(row: SsoConfigurationRow): SsoConfiguration {
  return {
    attributeMapping: parseJson<Record<string, string>>(row.attribute_mapping),
    certificate: row.certificate,
    createdAt: row.created_at.toISOString(),
    enabled: row.enabled,
    entityId: row.entity_id,
    id: row.id,
    provider: row.provider,
    ssoUrl: row.sso_url,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapScim(row: ScimConfigurationRow): ScimConfiguration {
  return {
    baseUrl: row.base_url,
    createdAt: row.created_at.toISOString(),
    groupSyncEnabled: row.group_sync_enabled,
    id: row.id,
    lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
    userSyncEnabled: row.user_sync_enabled,
  };
}

function mapRole(row: CustomRoleRow): CustomRole {
  return {
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: row.id,
    name: row.name,
    permissions: parseJson<string[]>(row.permissions),
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAssignment(row: RoleAssignmentRow): RoleAssignment {
  return {
    assignedAt: row.assigned_at.toISOString(),
    assignedBy: row.assigned_by,
    id: row.id,
    roleId: row.role_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
  };
}

function mapExportConfig(row: AuditExportConfigRow): AuditExportConfig {
  return {
    createdAt: row.created_at.toISOString(),
    destinationConfig: parseJson<Record<string, unknown>>(row.destination_config),
    destinationType: row.destination_type,
    enabled: row.enabled,
    filterCriteria: parseJson<Record<string, unknown>>(row.filter_criteria),
    id: row.id,
    lastExportAt: row.last_export_at ? row.last_export_at.toISOString() : null,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapExportHistory(row: AuditExportHistoryRow): AuditExportHistory {
  return {
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    configId: row.config_id,
    createdAt: row.created_at.toISOString(),
    errorMessage: row.error_message,
    id: row.id,
    recordsExported: row.records_exported,
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
