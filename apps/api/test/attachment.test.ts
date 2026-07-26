import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAttachmentRepository } from '../src/modules/attachment/attachment.repository';

describe('AttachmentRepository', () => {
  let repo: InMemoryAttachmentRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryAttachmentRepository();
  });

  it('should create attachment', async () => {
    const attachment = await repo.createAttachment(tenantId, {
      messageId: 'message-123',
      objectKey: 'attachments/doc.pdf',
      originalFilename: 'document.pdf',
      mimeDeclared: 'application/pdf',
      mimeDetected: null,
      byteSize: 1024000,
      checksum: null,
      scanStatus: 'PENDING',
      processingStatus: 'PENDING',
      mediaKind: 'DOCUMENT',
      extractedTextObjectKey: null,
    });

    expect(attachment.id).toBeDefined();
    expect(attachment.originalFilename).toBe('document.pdf');
    expect(attachment.byteSize).toBe(1024000);
    expect(attachment.scanStatus).toBe('PENDING');
  });

  it('should list attachments by message', async () => {
    await repo.createAttachment(tenantId, {
      messageId: 'message-1',
      objectKey: 'attachments/img1.jpg',
      originalFilename: 'image1.jpg',
      mimeDeclared: 'image/jpeg',
      mimeDetected: null,
      byteSize: 500000,
      checksum: null,
      scanStatus: 'CLEAN',
      processingStatus: 'READY',
      mediaKind: 'IMAGE',
      extractedTextObjectKey: null,
    });

    await repo.createAttachment(tenantId, {
      messageId: 'message-1',
      objectKey: 'attachments/img2.jpg',
      originalFilename: 'image2.jpg',
      mimeDeclared: 'image/jpeg',
      mimeDetected: null,
      byteSize: 600000,
      checksum: null,
      scanStatus: 'CLEAN',
      processingStatus: 'READY',
      mediaKind: 'IMAGE',
      extractedTextObjectKey: null,
    });

    const attachments = await repo.listAttachments(tenantId, 'message-1');
    expect(attachments).toHaveLength(2);
  });

  it('should update attachment', async () => {
    const attachment = await repo.createAttachment(tenantId, {
      messageId: 'message-1',
      objectKey: 'attachments/doc.pdf',
      originalFilename: 'document.pdf',
      mimeDeclared: 'application/pdf',
      mimeDetected: null,
      byteSize: 1024000,
      checksum: null,
      scanStatus: 'PENDING',
      processingStatus: 'PENDING',
      mediaKind: 'DOCUMENT',
      extractedTextObjectKey: null,
    });

    const updated = await repo.updateAttachment(tenantId, attachment.id, {
      scanStatus: 'CLEAN',
      processingStatus: 'READY',
    });

    expect(updated.scanStatus).toBe('CLEAN');
    expect(updated.processingStatus).toBe('READY');
  });

  it('should get attachment by id', async () => {
    const attachment = await repo.createAttachment(tenantId, {
      messageId: 'message-1',
      objectKey: 'attachments/test.txt',
      originalFilename: 'test.txt',
      mimeDeclared: 'text/plain',
      mimeDetected: null,
      byteSize: 100,
      checksum: null,
      scanStatus: 'CLEAN',
      processingStatus: 'READY',
      mediaKind: 'DOCUMENT',
      extractedTextObjectKey: null,
    });

    const found = await repo.getAttachment(tenantId, attachment.id);
    expect(found).toBeDefined();
    expect(found?.originalFilename).toBe('test.txt');
  });
});
