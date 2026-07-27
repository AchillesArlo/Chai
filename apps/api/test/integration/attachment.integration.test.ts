import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAttachmentRepository } from '../../src/modules/attachment/postgres-attachment.repository';

describe('API Postgres attachment repository (Fase 4.6)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('persists an attachment and its scan/processing updates across a new instance', async () => {
    const writer = new PostgresAttachmentRepository(runtime);

    const attachment = await writer.createAttachment(API_TENANT_ID, {
      byteSize: 2048,
      checksum: 'sha256:abc123',
      extractedTextObjectKey: null,
      mediaKind: 'DOCUMENT',
      messageId: null,
      mimeDeclared: 'application/pdf',
      mimeDetected: 'application/pdf',
      objectKey: 'tenants/a/attachments/doc-1.pdf',
      originalFilename: 'invoice.pdf',
      processingStatus: 'PENDING',
      scanStatus: 'PENDING',
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresAttachmentRepository(runtime);

    const fetched = await reader.getAttachment(API_TENANT_ID, attachment.id);
    expect(fetched?.originalFilename).toBe('invoice.pdf');
    expect(fetched?.scanStatus).toBe('PENDING');

    const scanned = await reader.updateAttachment(API_TENANT_ID, attachment.id, {
      scanStatus: 'CLEAN',
    });
    expect(scanned.scanStatus).toBe('CLEAN');

    const processed = await reader.updateAttachment(API_TENANT_ID, attachment.id, {
      extractedTextObjectKey: 'tenants/a/attachments/doc-1.txt',
      processingStatus: 'READY',
    });
    expect(processed.processingStatus).toBe('READY');
    expect(processed.extractedTextObjectKey).toBe('tenants/a/attachments/doc-1.txt');

    const listed = await reader.listAttachments(API_TENANT_ID);
    expect(listed.some((row) => row.id === attachment.id)).toBe(true);
  });

  it('isolates attachments by tenant under RLS', async () => {
    const repo = new PostgresAttachmentRepository(runtime);
    const attachment = await repo.createAttachment(API_TENANT_ID, {
      byteSize: 512,
      checksum: null,
      extractedTextObjectKey: null,
      mediaKind: 'IMAGE',
      messageId: null,
      mimeDeclared: 'image/png',
      mimeDetected: null,
      objectKey: 'tenants/a/attachments/photo.png',
      originalFilename: 'photo.png',
      processingStatus: 'PENDING',
      scanStatus: 'PENDING',
    });

    const crossTenantList = await repo.listAttachments(API_TENANT_B_ID);
    expect(crossTenantList.some((row) => row.id === attachment.id)).toBe(false);
    expect(await repo.getAttachment(API_TENANT_B_ID, attachment.id)).toBeNull();
  });
});
