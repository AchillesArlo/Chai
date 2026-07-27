import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import { NotificationRepository, type Notification } from './notification.repository';

interface NotificationRow {
  body: string;
  channel: string | null;
  created_at: Date;
  id: string;
  metadata: unknown;
  read_at: Date | null;
  sent_at: Date | null;
  status: Notification['status'];
  tenant_id: string;
  title: string;
  type: Notification['type'];
  updated_at: Date;
  user_id: string;
}

@Injectable()
export class PostgresNotificationRepository extends NotificationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listNotifications(
    tenantId: string,
    userId?: string,
  ): Promise<Notification[]> {
    const filter = userId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<NotificationRow[]>`
        SELECT * FROM chai.notification
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR user_id = ${filter}::uuid)
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapNotification(row));
    });
  }

  override async getNotification(
    tenantId: string,
    id: string,
  ): Promise<Notification | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<NotificationRow[]>`
        SELECT * FROM chai.notification
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapNotification(rows[0]) : null;
    });
  }

  override async createNotification(
    tenantId: string,
    notification: Omit<
      Notification,
      'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'sentAt' | 'readAt'
    >,
  ): Promise<Notification> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<NotificationRow[]>`
        INSERT INTO chai.notification (
          id, tenant_id, user_id, type, title, body, channel, status, metadata
        ) VALUES (
          ${id}, ${tenantId}, ${notification.userId}, ${notification.type},
          ${notification.title}, ${notification.body}, ${notification.channel},
          ${notification.status},
          ${JSON.stringify(notification.metadata)}::jsonb
        )
        RETURNING *
      `;
      return mapNotification(requireRow(rows));
    });
  }

  override async updateNotification(
    tenantId: string,
    id: string,
    update: Partial<Notification>,
  ): Promise<Notification> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.load(tx, tenantId, id);
      if (!existing) throw new Error('Notification not found');
      const merged = { ...existing, ...update };
      const rows = await tx<NotificationRow[]>`
        UPDATE chai.notification SET
          type = ${merged.type},
          title = ${merged.title},
          body = ${merged.body},
          channel = ${merged.channel},
          status = ${merged.status},
          metadata = ${JSON.stringify(merged.metadata)}::jsonb,
          sent_at = ${merged.sentAt},
          read_at = ${merged.readAt},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapNotification(requireRow(rows));
    });
  }

  override async markAsRead(tenantId: string, id: string): Promise<Notification> {
    return this.updateNotification(tenantId, id, {
      readAt: new Date().toISOString(),
      status: 'READ',
    });
  }

  private async load(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Notification | null> {
    const rows = await tx<NotificationRow[]>`
      SELECT * FROM chai.notification
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapNotification(rows[0]) : null;
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

function mapNotification(row: NotificationRow): Notification {
  return {
    body: row.body,
    channel: row.channel,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    metadata: parseJson<Record<string, unknown>>(row.metadata),
    readAt: row.read_at ? row.read_at.toISOString() : null,
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    status: row.status,
    tenantId: row.tenant_id,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at.toISOString(),
    userId: row.user_id,
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