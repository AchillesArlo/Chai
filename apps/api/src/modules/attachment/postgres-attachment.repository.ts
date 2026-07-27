import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import { AttachmentRepository, type Attachment } from './attachment.repository';

/** Bentuk baris chai.attachment — eksplisit, tanpa `any`. */
interface AttachmentRow {
  byte_size: number;
  checksum: string | null;
  created_at: Date;
  extracted_text_object_key: string | null;
  id: string;
  media_kind: Attachment['mediaKind'];
  message_id: string | null;
  mime_declared: string | null;
  mime_detected: string | null;
  object_key: string;
  original_filename: string;
  processing_status: Attachment['processingStatus'];
  scan_status: Attachment['scanStatus'];
  tenant_id: string;
  updated_at: Date;
}

@Injectable()
export class PostgresAttachmentRepository extends AttachmentRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listAttachments(
    tenantId: string,
    messageId?: string,
  ): Promise<Attachment[]> {
    const filter = messageId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AttachmentRow[]>`
        SELECT * FROM chai.attachment
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR message_id = ${filter}::uuid)
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapAttachment(row));
    });
  }

  override async getAttachment(
    tenantId: string,
    id: string,
  ): Promise<Attachment | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AttachmentRow[]>`
        SELECT * FROM chai.attachment
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapAttachment(rows[0]) : null;
    });
  }

  override async createAttachment(
    tenantId: string,
    attachment: Omit<Attachment, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Attachment> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AttachmentRow[]>`
        INSERT INTO chai.attachment (
          id, tenant_id, message_id, object_key, original_filename,
          mime_declared, mime_detected, byte_size, checksum, scan_status,
          processing_status, media_kind, extracted_text_object_key
        ) VALUES (
          ${id}, ${tenantId}, ${attachment.messageId}, ${attachment.objectKey},
          ${attachment.originalFilename}, ${attachment.mimeDeclared},
          ${attachment.mimeDetected}, ${attachment.byteSize}, ${attachment.checksum},
          ${attachment.scanStatus}, ${attachment.processingStatus},
          ${attachment.mediaKind}, ${attachment.extractedTextObjectKey}
        )
        RETURNING *
      `;
      return mapAttachment(requireRow(rows));
    });
  }

  override async updateAttachment(
    tenantId: string,
    id: string,
    update: Partial<Attachment>,
  ): Promise<Attachment> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadAttachment(tx, tenantId, id);
      if (!existing) throw new Error('Attachment not found');
      const merged = { ...existing, ...update };
      const rows = await tx<AttachmentRow[]>`
        UPDATE chai.attachment SET
          message_id = ${merged.messageId},
          object_key = ${merged.objectKey},
          original_filename = ${merged.originalFilename},
          mime_declared = ${merged.mimeDeclared},
          mime_detected = ${merged.mimeDetected},
          byte_size = ${merged.byteSize},
          checksum = ${merged.checksum},
          scan_status = ${merged.scanStatus},
          processing_status = ${merged.processingStatus},
          media_kind = ${merged.mediaKind},
          extracted_text_object_key = ${merged.extractedTextObjectKey},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapAttachment(requireRow(rows));
    });
  }

  private async loadAttachment(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Attachment | null> {
    const rows = await tx<AttachmentRow[]>`
      SELECT * FROM chai.attachment
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapAttachment(rows[0]) : null;
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

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    byteSize: row.byte_size,
    checksum: row.checksum,
    createdAt: row.created_at.toISOString(),
    extractedTextObjectKey: row.extracted_text_object_key,
    id: row.id,
    mediaKind: row.media_kind,
    messageId: row.message_id,
    mimeDeclared: row.mime_declared,
    mimeDetected: row.mime_detected,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    processingStatus: row.processing_status,
    scanStatus: row.scan_status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Baris pertama hasil RETURNING, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
