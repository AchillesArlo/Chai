import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAuditImmutabilityRepository } from '../src/modules/audit-immutability/audit-immutability.repository';

describe('AuditImmutabilityRepository', () => {
  let repo: InMemoryAuditImmutabilityRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryAuditImmutabilityRepository();
  });

  describe('Audit Log Entries', () => {
    it('should create audit entry with hash chain', async () => {
      const entry = await repo.createEntry({
        tenantId,
        eventType: 'user.created',
        actorType: 'system',
        actorId: 'system-1',
        resourceType: 'user',
        resourceId: 'user-123',
        action: 'create',
        previousState: null,
        newState: { name: 'John Doe', email: 'john@example.com' },
        metadata: {},
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        correlationId: null,
      });

      expect(entry.id).toBeDefined();
      expect(entry.hash).toBeDefined();
      expect(entry.previousHash).toBeNull();
    });

    it('should chain hashes correctly', async () => {
      const entry1 = await repo.createEntry({
        tenantId,
        eventType: 'user.created',
        actorType: 'system',
        actorId: 'system-1',
        resourceType: 'user',
        resourceId: 'user-1',
        action: 'create',
        previousState: null,
        newState: { name: 'User 1' },
        metadata: {},
        ipAddress: null,
        userAgent: null,
        correlationId: null,
      });

      const entry2 = await repo.createEntry({
        tenantId,
        eventType: 'user.updated',
        actorType: 'user',
        actorId: 'user-1',
        resourceType: 'user',
        resourceId: 'user-1',
        action: 'update',
        previousState: { name: 'User 1' },
        newState: { name: 'User 1 Updated' },
        metadata: {},
        ipAddress: null,
        userAgent: null,
        correlationId: null,
      });

      expect(entry2.previousHash).toBe(entry1.hash);
    });

    it('should verify chain integrity', async () => {
      await repo.createEntry({
        tenantId,
        eventType: 'test.event',
        actorType: 'system',
        actorId: 'system-1',
        resourceType: 'test',
        resourceId: 'test-1',
        action: 'create',
        previousState: null,
        newState: {},
        metadata: {},
        ipAddress: null,
        userAgent: null,
        correlationId: null,
      });

      await repo.createEntry({
        tenantId,
        eventType: 'test.event',
        actorType: 'system',
        actorId: 'system-1',
        resourceType: 'test',
        resourceId: 'test-2',
        action: 'create',
        previousState: null,
        newState: {},
        metadata: {},
        ipAddress: null,
        userAgent: null,
        correlationId: null,
      });

      const check = await repo.verifyChain(tenantId, 'admin-1');
      expect(check.status).toBe('passed');
      expect(check.totalEntries).toBe(2);
      expect(check.verifiedEntries).toBe(2);
      expect(check.brokenChains).toBe(0);
    });

    it('should list entries by tenant', async () => {
      await repo.createEntry({
        tenantId,
        eventType: 'test.event',
        actorType: 'system',
        actorId: 'system-1',
        resourceType: 'test',
        resourceId: 'test-1',
        action: 'create',
        previousState: null,
        newState: {},
        metadata: {},
        ipAddress: null,
        userAgent: null,
        correlationId: null,
      });

      const entries = await repo.listEntries(tenantId);
      expect(entries).toHaveLength(1);
    });
  });
});
