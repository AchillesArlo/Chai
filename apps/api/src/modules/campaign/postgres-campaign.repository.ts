import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  CampaignRepository,
  type Campaign,
  type CampaignMessage,
} from './campaign.repository';

interface CampaignRow {
  channel: string;
  completed_at: Date | null;
  created_at: Date;
  id: string;
  message_template_id: string | null;
  metrics: unknown;
  name: string;
  scheduled_at: Date | null;
  started_at: Date | null;
  status: Campaign['status'];
  target_segment: unknown;
  tenant_id: string;
  type: Campaign['type'];
  updated_at: Date;
}

interface CampaignMessageRow {
  campaign_id: string;
  contact_id: string;
  created_at: Date;
  delivered_at: Date | null;
  error_code: string | null;
  failed_at: Date | null;
  id: string;
  message_id: string | null;
  read_at: Date | null;
  sent_at: Date | null;
  status: CampaignMessage['status'];
  tenant_id: string;
  updated_at: Date;
}

@Injectable()
export class PostgresCampaignRepository extends CampaignRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listCampaigns(tenantId: string): Promise<Campaign[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CampaignRow[]>`
        SELECT * FROM chai.campaign
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapCampaign(row));
    });
  }

  override async getCampaign(
    tenantId: string,
    id: string,
  ): Promise<Campaign | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CampaignRow[]>`
        SELECT * FROM chai.campaign
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapCampaign(rows[0]) : null;
    });
  }

  override async createCampaign(
    tenantId: string,
    campaign: Omit<
      Campaign,
      | 'id'
      | 'tenantId'
      | 'createdAt'
      | 'updatedAt'
      | 'startedAt'
      | 'completedAt'
      | 'metrics'
    >,
  ): Promise<Campaign> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CampaignRow[]>`
        INSERT INTO chai.campaign (
          id, tenant_id, name, type, status, channel, message_template_id,
          target_segment, scheduled_at
        ) VALUES (
          ${id}, ${tenantId}, ${campaign.name}, ${campaign.type},
          ${campaign.status}, ${campaign.channel}, ${campaign.messageTemplateId},
          ${campaign.targetSegment === null ? null : tx.json(campaign.targetSegment as Parameters<typeof tx.json>[0])}::jsonb,
          ${campaign.scheduledAt}::timestamptz
        )
        RETURNING *
      `;
      return mapCampaign(requireRow(rows));
    });
  }

  override async updateCampaign(
    tenantId: string,
    id: string,
    update: Partial<Campaign>,
  ): Promise<Campaign> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadCampaign(tx, tenantId, id);
      if (!existing) throw new Error('Campaign not found');
      const merged = { ...existing, ...update };
      const rows = await tx<CampaignRow[]>`
        UPDATE chai.campaign SET
          name = ${merged.name},
          type = ${merged.type},
          status = ${merged.status},
          channel = ${merged.channel},
          message_template_id = ${merged.messageTemplateId},
          target_segment = ${merged.targetSegment === null ? null : tx.json(merged.targetSegment as Parameters<typeof tx.json>[0])}::jsonb,
          scheduled_at = ${merged.scheduledAt}::timestamptz,
          started_at = ${merged.startedAt}::timestamptz,
          completed_at = ${merged.completedAt}::timestamptz,
          metrics = ${tx.json(merged.metrics as unknown as Parameters<typeof tx.json>[0])}::jsonb,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapCampaign(requireRow(rows));
    });
  }

  override async listCampaignMessages(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignMessage[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CampaignMessageRow[]>`
        SELECT * FROM chai.campaign_message
        WHERE tenant_id = ${tenantId} AND campaign_id = ${campaignId}
        ORDER BY created_at ASC
      `;
      return rows.map((row) => mapMessage(row));
    });
  }

  override async createCampaignMessage(
    tenantId: string,
    message: Omit<
      CampaignMessage,
      | 'id'
      | 'tenantId'
      | 'createdAt'
      | 'updatedAt'
      | 'sentAt'
      | 'deliveredAt'
      | 'readAt'
      | 'failedAt'
      | 'errorCode'
    >,
  ): Promise<CampaignMessage> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CampaignMessageRow[]>`
        INSERT INTO chai.campaign_message (
          id, campaign_id, tenant_id, contact_id, message_id, status
        ) VALUES (
          ${id}, ${message.campaignId}, ${tenantId}, ${message.contactId},
          ${message.messageId}, ${message.status}
        )
        RETURNING *
      `;
      return mapMessage(requireRow(rows));
    });
  }

  override async updateCampaignMessage(
    tenantId: string,
    id: string,
    update: Partial<CampaignMessage>,
  ): Promise<CampaignMessage> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadMessage(tx, tenantId, id);
      if (!existing) throw new Error('Campaign message not found');
      const merged = { ...existing, ...update };
      const rows = await tx<CampaignMessageRow[]>`
        UPDATE chai.campaign_message SET
          campaign_id = ${merged.campaignId},
          contact_id = ${merged.contactId},
          message_id = ${merged.messageId},
          status = ${merged.status},
          sent_at = ${merged.sentAt}::timestamptz,
          delivered_at = ${merged.deliveredAt}::timestamptz,
          read_at = ${merged.readAt}::timestamptz,
          failed_at = ${merged.failedAt}::timestamptz,
          error_code = ${merged.errorCode},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapMessage(requireRow(rows));
    });
  }

  private async loadCampaign(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Campaign | null> {
    const rows = await tx<CampaignRow[]>`
      SELECT * FROM chai.campaign
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapCampaign(rows[0]) : null;
  }

  private async loadMessage(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<CampaignMessage | null> {
    const rows = await tx<CampaignMessageRow[]>`
      SELECT * FROM chai.campaign_message
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapMessage(rows[0]) : null;
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

function mapCampaign(row: CampaignRow): Campaign {
  return {
    channel: row.channel,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    messageTemplateId: row.message_template_id,
    metrics: parseJson<Campaign['metrics']>(row.metrics),
    name: row.name,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    status: row.status,
    targetSegment: parseJson<Record<string, unknown> | null>(row.target_segment),
    tenantId: row.tenant_id,
    type: row.type,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapMessage(row: CampaignMessageRow): CampaignMessage {
  return {
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    createdAt: row.created_at.toISOString(),
    deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : null,
    errorCode: row.error_code,
    failedAt: row.failed_at ? row.failed_at.toISOString() : null,
    id: row.id,
    messageId: row.message_id,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    status: row.status,
    tenantId: row.tenant_id,
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