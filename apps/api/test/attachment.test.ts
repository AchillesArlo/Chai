import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';

import { InMemoryAttachmentRepository } from '../src/modules/attachment/attachment.repository';
import {
  AttachmentController,
  CreateAttachmentDto,
  UpdateAttachmentDto,
} from '../src/modules/attachment/attachment.controller';

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

describe('AttachmentController (REQ-10-019 malware scan enforcement)', () => {
  let repo: InMemoryAttachmentRepository;
  let controller: AttachmentController;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryAttachmentRepository();
    controller = new AttachmentController(repo);
  });

  it('blocks downloading attachments when scanStatus is PENDING or INFECTED', async () => {
    const pending = await repo.createAttachment(tenantId, {
      messageId: null,
      objectKey: 'doc-pending.pdf',
      originalFilename: 'doc.pdf',
      mimeDeclared: 'application/pdf',
      mimeDetected: null,
      byteSize: 1000,
      checksum: null,
      scanStatus: 'PENDING',
      processingStatus: 'PENDING',
      mediaKind: 'DOCUMENT',
      extractedTextObjectKey: null,
    });

    await expect(controller.download(tenantId, pending.id)).rejects.toThrow();

    const infected = await repo.createAttachment(tenantId, {
      messageId: null,
      objectKey: 'virus.exe',
      originalFilename: 'virus.exe',
      mimeDeclared: 'application/x-msdownload',
      mimeDetected: null,
      byteSize: 5000,
      checksum: null,
      scanStatus: 'INFECTED',
      processingStatus: 'FAILED',
      mediaKind: 'OTHER',
      extractedTextObjectKey: null,
    });

    await expect(controller.download(tenantId, infected.id)).rejects.toThrow();
  });

  it('allows downloading CLEAN attachments', async () => {
    const clean = await repo.createAttachment(tenantId, {
      messageId: null,
      objectKey: 'clean.png',
      originalFilename: 'clean.png',
      mimeDeclared: 'image/png',
      mimeDetected: 'image/png',
      byteSize: 2000,
      checksum: 'sha256:123',
      scanStatus: 'CLEAN',
      processingStatus: 'READY',
      mediaKind: 'IMAGE',
      extractedTextObjectKey: null,
    });

    const download = await controller.download(tenantId, clean.id);
    expect(download.scanStatus).toBe('CLEAN');
    expect(download.downloadUrl).toBe('/storage/clean.png');
  });

  it('runs scan pipeline and updates scanStatus to CLEAN or INFECTED', async () => {
    const doc = await repo.createAttachment(tenantId, {
      messageId: null,
      objectKey: 'safe-file.pdf',
      originalFilename: 'safe-file.pdf',
      mimeDeclared: 'application/pdf',
      mimeDetected: null,
      byteSize: 1500,
      checksum: null,
      scanStatus: 'PENDING',
      processingStatus: 'PENDING',
      mediaKind: 'DOCUMENT',
      extractedTextObjectKey: null,
    });

    const scanned = await controller.scan(tenantId, doc.id);
    expect(scanned.scanStatus).toBe('CLEAN');

    const virus = await repo.createAttachment(tenantId, {
      messageId: null,
      objectKey: 'eicar-test.txt',
      originalFilename: 'virus-sample.exe',
      mimeDeclared: 'text/plain',
      mimeDetected: null,
      byteSize: 68,
      checksum: null,
      scanStatus: 'PENDING',
      processingStatus: 'PENDING',
      mediaKind: 'OTHER',
      extractedTextObjectKey: null,
    });

    const scannedVirus = await controller.scan(tenantId, virus.id);
    expect(scannedVirus.scanStatus).toBe('INFECTED');
  });
});


/**
 * FASE 28.C — Test kontrak keamanan file. Membuktikan invarian "server yang
 * menentukan" (28.A) di dua lapis: (1) ValidationPipe menolak field keamanan yang
 * dikirim klien — persis konfigurasi bootstrap (whitelist + forbidNonWhitelisted +
 * transform), dan (2) kode controller memaksa nilai server-side.
 *
 * Catatan: ini test KONTRAK, bukan byte nyata (belum ada jalur ingest byte —
 * lihat 28.B). Penolakan unduh PENDING/INFECTED (28.C c) sudah diuji di describe
 * "REQ-10-019" di atas dan sengaja tidak diduplikasi di sini.
 */
describe('Attachment security contract (FASE 28.C)', () => {
  const tenantId = 'tenant-1';
  const pipe = new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });

  const validCreateBody = {
    messageId: null,
    objectKey: 'attachments/doc.pdf',
    originalFilename: 'document.pdf',
    mimeDeclared: 'application/pdf',
    processingStatus: 'PENDING',
    mediaKind: 'DOCUMENT',
    extractedTextObjectKey: null,
  };

  it('(a) ValidationPipe rejects a create body carrying client-supplied security fields', async () => {
    // A client trying to assert scanStatus/mimeDetected/checksum/byteSize must be
    // rejected by forbidNonWhitelisted, never silently accepted.
    await expect(
      pipe.transform(
        { ...validCreateBody, scanStatus: 'CLEAN', mimeDetected: 'image/png', checksum: 'x', byteSize: 42 },
        { type: 'body', metatype: CreateAttachmentDto },
      ),
    ).rejects.toThrow();
  });

  it('(a) server forces scanStatus PENDING and null security fields even if create() receives them', async () => {
    const repo = new InMemoryAttachmentRepository();
    const controller = new AttachmentController(repo);

    // Simulate a value that still carries the client-supplied fields at runtime
    // (e.g. if the pipe were ever misconfigured). The controller must override.
    const clientInput: CreateAttachmentDto & {
      byteSize: number;
      checksum: string;
      mimeDetected: string;
      scanStatus: string;
    } = {
      ...validCreateBody,
      objectKey: 'attachments/evil.png',
      originalFilename: 'evil.png',
      mimeDeclared: 'image/png',
      processingStatus: 'READY',
      mediaKind: 'IMAGE',
      scanStatus: 'CLEAN',
      mimeDetected: 'image/png',
      checksum: 'sha256:deadbeef',
      byteSize: 999_999,
    };

    const created = await controller.create(tenantId, clientInput);
    expect(created.scanStatus).toBe('PENDING');
    expect(created.mimeDetected).toBeNull();
    expect(created.checksum).toBeNull();
    expect(created.byteSize).toBe(0);
  });

  it('(b) ValidationPipe rejects a PUT body carrying scanStatus — INFECTED cannot be moved to CLEAN', async () => {
    await expect(
      pipe.transform(
        { objectKey: 'attachments/evil.png', scanStatus: 'CLEAN' },
        { type: 'body', metatype: UpdateAttachmentDto },
      ),
    ).rejects.toThrow();
  });

  it('(b) a PUT carrying only whitelisted fields cannot change a terminal INFECTED status', async () => {
    const repo = new InMemoryAttachmentRepository();
    const controller = new AttachmentController(repo);

    const infected = await repo.createAttachment(tenantId, {
      messageId: null,
      objectKey: 'attachments/eicar.txt',
      originalFilename: 'eicar.txt',
      mimeDeclared: 'text/plain',
      mimeDetected: null,
      byteSize: 68,
      checksum: null,
      scanStatus: 'INFECTED',
      processingStatus: 'FAILED',
      mediaKind: 'OTHER',
      extractedTextObjectKey: null,
    });

    // The UpdateAttachmentDto has no scanStatus field, so a well-formed PUT can
    // only touch metadata; scan_status stays terminal.
    const updated = await controller.update(tenantId, infected.id, {
      processingStatus: 'READY',
    });
    expect(updated.scanStatus).toBe('INFECTED');
  });
});
