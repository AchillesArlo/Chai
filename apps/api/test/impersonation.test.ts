import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryImpersonationRepository } from '../src/modules/impersonation/impersonation.repository';

describe('ImpersonationRepository', () => {
  let repo: InMemoryImpersonationRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryImpersonationRepository();
  });

  describe('Impersonation Sessions', () => {
    it('should create impersonation session', async () => {
      const session = await repo.createSession({
        tenantId,
        impersonatorId: 'agent-1',
        impersonatedUserId: 'user-123',
        reason: 'Customer support request',
        startedAt: new Date().toISOString(),
        status: 'active',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        maxDurationMinutes: 60,
        requiresApproval: true,
        approvedBy: null,
        approvedAt: null,
      });

      expect(session.id).toBeDefined();
      expect(session.impersonatorId).toBe('agent-1');
      expect(session.status).toBe('active');
    });

    it('should list sessions by tenant', async () => {
      await repo.createSession({
        tenantId,
        impersonatorId: 'agent-1',
        impersonatedUserId: 'user-123',
        reason: 'Support',
        startedAt: new Date().toISOString(),
        status: 'active',
        ipAddress: null,
        userAgent: null,
        maxDurationMinutes: 60,
        requiresApproval: true,
        approvedBy: null,
        approvedAt: null,
      });

      const sessions = await repo.listSessions(tenantId);
      expect(sessions).toHaveLength(1);
    });

    it('should update session status', async () => {
      const session = await repo.createSession({
        tenantId,
        impersonatorId: 'agent-1',
        impersonatedUserId: 'user-123',
        reason: 'Support',
        startedAt: new Date().toISOString(),
        status: 'active',
        ipAddress: null,
        userAgent: null,
        maxDurationMinutes: 60,
        requiresApproval: true,
        approvedBy: null,
        approvedAt: null,
      });

      const updated = await repo.updateSession(session.id, {
        status: 'ended',
        endedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('ended');
      expect(updated.endedAt).toBeDefined();
    });
  });

  describe('Impersonation Audit Logs', () => {
    it('should create audit log', async () => {
      const session = await repo.createSession({
        tenantId,
        impersonatorId: 'agent-1',
        impersonatedUserId: 'user-123',
        reason: 'Support',
        startedAt: new Date().toISOString(),
        status: 'active',
        ipAddress: null,
        userAgent: null,
        maxDurationMinutes: 60,
        requiresApproval: true,
        approvedBy: null,
        approvedAt: null,
      });

      const log = await repo.createAuditLog({
        impersonationSessionId: session.id,
        action: 'view_profile',
        resourceType: 'user',
        resourceId: 'user-123',
        details: { fields: ['name', 'email'] },
      });

      expect(log.id).toBeDefined();
      expect(log.action).toBe('view_profile');
    });

    it('should list audit logs by session', async () => {
      const session = await repo.createSession({
        tenantId,
        impersonatorId: 'agent-1',
        impersonatedUserId: 'user-123',
        reason: 'Support',
        startedAt: new Date().toISOString(),
        status: 'active',
        ipAddress: null,
        userAgent: null,
        maxDurationMinutes: 60,
        requiresApproval: true,
        approvedBy: null,
        approvedAt: null,
      });

      await repo.createAuditLog({
        impersonationSessionId: session.id,
        action: 'view_profile',
        resourceType: 'user',
        resourceId: 'user-123',
        details: {},
      });

      await repo.createAuditLog({
        impersonationSessionId: session.id,
        action: 'update_profile',
        resourceType: 'user',
        resourceId: 'user-123',
        details: { field: 'name' },
      });

      const logs = await repo.listAuditLogs(session.id);
      expect(logs).toHaveLength(2);
    });
  });
});
