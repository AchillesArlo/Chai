import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Attachment {
  id: string;
  tenantId: string;
  messageId: string | null;
  objectKey: string;
  originalFilename: string;
  mimeDeclared: string | null;
  mimeDetected: string | null;
  byteSize: number;
  checksum: string | null;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED';
  processingStatus: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  mediaKind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER' | null;
  extractedTextObjectKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class AttachmentRepository {
  abstract listAttachments(tenantId: string, messageId?: string): Promise<Attachment[]>;
  abstract getAttachment(tenantId: string, id: string): Promise<Attachment | null>;
  abstract createAttachment(tenantId: string, attachment: Omit<Attachment, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Attachment>;
  abstract updateAttachment(tenantId: string, id: string, update: Partial<Attachment>): Promise<Attachment>;
}

@Injectable()
export class InMemoryAttachmentRepository extends AttachmentRepository {
  private attachments = new Map<string, Attachment>();

  async listAttachments(tenantId: string, messageId?: string): Promise<Attachment[]> {
    return Array.from(this.attachments.values()).filter(
      a => a.tenantId === tenantId && (!messageId || a.messageId === messageId)
    );
  }

  async getAttachment(tenantId: string, id: string): Promise<Attachment | null> {
    const a = this.attachments.get(id);
    return a && a.tenantId === tenantId ? a : null;
  }

  async createAttachment(tenantId: string, attachment: Omit<Attachment, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Attachment> {
    const now = new Date().toISOString();
    const created = { ...attachment, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.attachments.set(created.id, created);
    return created;
  }

  async updateAttachment(tenantId: string, id: string, update: Partial<Attachment>): Promise<Attachment> {
    const existing = this.attachments.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Attachment not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.attachments.set(id, updated);
    return updated;
  }
}
