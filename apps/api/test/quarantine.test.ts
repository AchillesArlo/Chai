import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryQuarantineRepository } from '../src/modules/quarantine/quarantine.repository';

describe('QuarantineRepository', () => {
  let repo: InMemoryQuarantineRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryQuarantineRepository();
  });

  describe('Quarantine Entries', () => {
    it('should create quarantine entry', async () => {
      const entry = await repo.createEntry({
        tenantId,
        sourceType: 'webhook',
        sourceIdentifier: 'wh-123',
        rawPayload: { data: 'sensitive' },
        redactedPayload: null,
        redactionOrder: null,
        reason: 'prohibited_data',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        retentionUntil: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(entry.id).toBeDefined();
      expect(entry.sourceType).toBe('webhook');
      expect(entry.status).toBe('pending');
    });

    it('should list entries by tenant', async () => {
      await repo.createEntry({
        tenantId,
        sourceType: 'webhook',
        sourceIdentifier: 'wh-123',
        rawPayload: {},
        redactedPayload: null,
        redactionOrder: null,
        reason: 'prohibited_data',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        retentionUntil: new Date().toISOString(),
      });

      const entries = await repo.listEntries(tenantId);
      expect(entries).toHaveLength(1);
    });

    it('should log access to quarantine entry', async () => {
      const entry = await repo.createEntry({
        tenantId,
        sourceType: 'webhook',
        sourceIdentifier: 'wh-123',
        rawPayload: {},
        redactedPayload: null,
        redactionOrder: null,
        reason: 'prohibited_data',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        retentionUntil: new Date().toISOString(),
      });

      const log = await repo.logAccess({
        quarantineEntryId: entry.id,
        accessedBy: 'user-123',
        accessType: 'view',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        reason: 'review',
      });

      expect(log.id).toBeDefined();
      expect(log.accessType).toBe('view');

      const logs = await repo.listAccessLogs(entry.id);
      expect(logs).toHaveLength(1);
    });
  });
});
