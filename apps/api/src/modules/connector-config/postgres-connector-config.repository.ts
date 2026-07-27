import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  ConnectorConfigRepository,
  type ConnectorConfig,
  type ConnectorSecret,
} from './connector-config.repository';

/** Bentuk baris public.connector_configs. `config_schema` adalah jsonb. */
interface ConnectorConfigRow {
  config_hash: string;
  config_schema: unknown;
  config_values_encrypted: Buffer | null;
  connector_provider: string;
  connector_type: string;
  created_at: Date;
  created_by: string;
  description: string | null;
  id: string;
  last_error: string | null;
  last_tested_at: Date | null;
  name: string;
  status: ConnectorConfig['status'];
  tenant_id: string;
  updated_at: Date;
  updated_by: string | null;
}

/** Bentuk baris public.connector_secrets — tanpa kolom tenant_id (child table). */
interface ConnectorSecretRow {
  connector_config_id: string;
  created_at: Date;
  id: string;
  rotated_at: Date | null;
  rotated_by: string | null;
  secret_key: string;
  secret_value_encrypted: Buffer;
  secret_version: number;
}

@Injectable()
export class PostgresConnectorConfigRepository extends ConnectorConfigRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listConfigs(tenantId: string): Promise<ConnectorConfig[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ConnectorConfigRow[]>`
        SELECT * FROM public.connector_configs
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapConfig(row));
    });
  }

  override async getConfig(
    tenantId: string,
    id: string,
  ): Promise<ConnectorConfig | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ConnectorConfigRow[]>`
        SELECT * FROM public.connector_configs
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapConfig(rows[0]) : null;
    });
  }

  override async createConfig(
    tenantId: string,
    config: Omit<ConnectorConfig, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConnectorConfig> {
    const id = randomUUID();
    const configSchema = JSON.stringify(config.configSchema);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ConnectorConfigRow[]>`
        INSERT INTO public.connector_configs (
          id, tenant_id, connector_type, connector_provider, name, description,
          config_schema, config_values_encrypted, config_hash, status,
          last_tested_at, last_error, created_by, updated_by
        ) VALUES (
          ${id}, ${tenantId}, ${config.connectorType}, ${config.connectorProvider},
          ${config.name}, ${config.description}, ${configSchema}::jsonb,
          ${config.configValuesEncrypted}, ${config.configHash}, ${config.status},
          ${config.lastTestedAt}::timestamptz, ${config.lastError},
          ${config.createdBy}, ${config.updatedBy}
        )
        RETURNING *
      `;
      return mapConfig(requireRow(rows));
    });
  }

  override async updateConfig(
    tenantId: string,
    id: string,
    update: Partial<ConnectorConfig>,
  ): Promise<ConnectorConfig> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadConfig(tx, tenantId, id);
      if (!existing) throw new Error('Connector config not found');
      const merged = { ...existing, ...update };
      const configSchema = JSON.stringify(merged.configSchema);
      const rows = await tx<ConnectorConfigRow[]>`
        UPDATE public.connector_configs SET
          connector_type = ${merged.connectorType},
          connector_provider = ${merged.connectorProvider},
          name = ${merged.name},
          description = ${merged.description},
          config_schema = ${configSchema}::jsonb,
          config_values_encrypted = ${merged.configValuesEncrypted},
          config_hash = ${merged.configHash},
          status = ${merged.status},
          last_tested_at = ${merged.lastTestedAt}::timestamptz,
          last_error = ${merged.lastError},
          updated_by = ${merged.updatedBy},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapConfig(requireRow(rows));
    });
  }

  override async deleteConfig(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM public.connector_configs
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Connector config not found');
    });
  }

  override async listSecrets(
    tenantId: string,
    configId: string,
  ): Promise<ConnectorSecret[]> {
    return this.tx(tenantId, async (tx) => {
      // The tenant_isolation policy on connector_secrets (0040) is enforced
      // through the parent connector_configs row (EXISTS ... tenant_id =
      // current_tenant_id()), so no explicit tenant filter is written here --
      // RLS already narrows this to the caller's tenant.
      const rows = await tx<ConnectorSecretRow[]>`
        SELECT * FROM public.connector_secrets
        WHERE connector_config_id = ${configId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapSecret(row));
    });
  }

  override async createSecret(
    tenantId: string,
    secret: Omit<ConnectorSecret, 'id' | 'createdAt'>,
  ): Promise<ConnectorSecret> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ConnectorSecretRow[]>`
        INSERT INTO public.connector_secrets (
          id, connector_config_id, secret_key, secret_value_encrypted,
          secret_version, rotated_at, rotated_by
        ) VALUES (
          ${id}, ${secret.connectorConfigId}, ${secret.secretKey},
          ${secret.secretValueEncrypted}, ${secret.secretVersion},
          ${secret.rotatedAt}::timestamptz, ${secret.rotatedBy}
        )
        RETURNING *
      `;
      return mapSecret(requireRow(rows));
    });
  }

  override async deleteSecret(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM public.connector_secrets
        WHERE id = ${id}
      `;
      if (result.count === 0) throw new Error('Connector secret not found');
    });
  }

  private async loadConfig(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<ConnectorConfig | null> {
    const rows = await tx<ConnectorConfigRow[]>`
      SELECT * FROM public.connector_configs
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapConfig(rows[0]) : null;
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

function mapConfig(row: ConnectorConfigRow): ConnectorConfig {
  return {
    configHash: row.config_hash,
    configSchema: parseJson<Record<string, unknown>>(row.config_schema),
    configValuesEncrypted: row.config_values_encrypted,
    connectorProvider: row.connector_provider,
    connectorType: row.connector_type,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    description: row.description,
    id: row.id,
    lastError: row.last_error,
    lastTestedAt: row.last_tested_at ? row.last_tested_at.toISOString() : null,
    name: row.name,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

function mapSecret(row: ConnectorSecretRow): ConnectorSecret {
  return {
    connectorConfigId: row.connector_config_id,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    rotatedAt: row.rotated_at ? row.rotated_at.toISOString() : null,
    rotatedBy: row.rotated_by,
    secretKey: row.secret_key,
    secretValueEncrypted: row.secret_value_encrypted,
    secretVersion: row.secret_version,
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
