import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import { TemplateRepository, type MessageTemplate } from './template.repository';

interface MessageTemplateRow {
  body: string;
  category: MessageTemplate['category'];
  created_at: Date;
  id: string;
  language: string;
  name: string;
  provider_ref: string | null;
  status: MessageTemplate['status'];
  tenant_id: string;
  updated_at: Date;
  variables: unknown;
}

@Injectable()
export class PostgresTemplateRepository extends TemplateRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listTemplates(
    tenantId: string,
    category?: string,
  ): Promise<MessageTemplate[]> {
    const filter = category ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<MessageTemplateRow[]>`
        SELECT * FROM chai.message_template
        WHERE tenant_id = ${tenantId}
          AND (${filter}::text IS NULL OR category = ${filter})
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapTemplate(row));
    });
  }

  override async getTemplate(
    tenantId: string,
    id: string,
  ): Promise<MessageTemplate | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<MessageTemplateRow[]>`
        SELECT * FROM chai.message_template
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapTemplate(rows[0]) : null;
    });
  }

  override async createTemplate(
    tenantId: string,
    template: Omit<MessageTemplate, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<MessageTemplate> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<MessageTemplateRow[]>`
        INSERT INTO chai.message_template (
          id, tenant_id, name, language, category, status, body, variables,
          provider_ref
        ) VALUES (
          ${id}, ${tenantId}, ${template.name}, ${template.language},
          ${template.category}, ${template.status}, ${template.body},
          ${tx.json(template.variables as unknown as Parameters<typeof tx.json>[0])}::jsonb, ${template.providerRef}
        )
        RETURNING *
      `;
      return mapTemplate(requireRow(rows));
    });
  }

  override async updateTemplate(
    tenantId: string,
    id: string,
    update: Partial<MessageTemplate>,
  ): Promise<MessageTemplate> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.load(tx, tenantId, id);
      if (!existing) throw new Error('Template not found');
      const merged = { ...existing, ...update };
      const rows = await tx<MessageTemplateRow[]>`
        UPDATE chai.message_template SET
          name = ${merged.name},
          language = ${merged.language},
          category = ${merged.category},
          status = ${merged.status},
          body = ${merged.body},
          variables = ${tx.json(merged.variables as unknown as Parameters<typeof tx.json>[0])}::jsonb,
          provider_ref = ${merged.providerRef},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapTemplate(requireRow(rows));
    });
  }

  override async deleteTemplate(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.message_template
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Template not found');
    });
  }

  private async load(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<MessageTemplate | null> {
    const rows = await tx<MessageTemplateRow[]>`
      SELECT * FROM chai.message_template
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapTemplate(rows[0]) : null;
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

function mapTemplate(row: MessageTemplateRow): MessageTemplate {
  return {
    body: row.body,
    category: row.category,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    language: row.language,
    name: row.name,
    providerRef: row.provider_ref,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
    variables: parseJson<string[]>(row.variables),
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