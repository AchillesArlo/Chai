import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAIAgentRepository } from '../src/modules/ai-agent/ai-agent.repository';

describe('AIAgentRepository', () => {
  let repo: InMemoryAIAgentRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryAIAgentRepository();
  });

  describe('Agent Profiles', () => {
    it('should create agent profile', async () => {
      const profile = await repo.createProfile(tenantId, {
        name: 'Customer Service Bot',
        useCase: 'customer_support',
        status: 'ACTIVE',
        tone: 'friendly',
        language: 'id',
        businessRules: { maxRetries: 3 },
        handoverPolicy: { afterAttempts: 5 },
      });

      expect(profile.id).toBeDefined();
      expect(profile.name).toBe('Customer Service Bot');
      expect(profile.status).toBe('ACTIVE');
    });

    it('should list profiles by tenant', async () => {
      await repo.createProfile(tenantId, {
        name: 'Bot 1',
        useCase: 'support',
        status: 'ACTIVE',
        tone: 'professional',
        language: 'id',
        businessRules: {},
        handoverPolicy: {},
      });

      await repo.createProfile(tenantId, {
        name: 'Bot 2',
        useCase: 'sales',
        status: 'DRAFT',
        tone: 'casual',
        language: 'en',
        businessRules: {},
        handoverPolicy: {},
      });

      const profiles = await repo.listProfiles(tenantId);
      expect(profiles).toHaveLength(2);
    });

    it('should update profile', async () => {
      const profile = await repo.createProfile(tenantId, {
        name: 'Test Bot',
        useCase: 'support',
        status: 'DRAFT',
        tone: 'neutral',
        language: 'id',
        businessRules: {},
        handoverPolicy: {},
      });

      const updated = await repo.updateProfile(tenantId, profile.id, {
        status: 'ACTIVE',
        tone: 'friendly',
      });

      expect(updated.status).toBe('ACTIVE');
      expect(updated.tone).toBe('friendly');
    });

    it('should delete profile', async () => {
      const profile = await repo.createProfile(tenantId, {
        name: 'Delete Me',
        useCase: 'test',
        status: 'DRAFT',
        tone: 'neutral',
        language: 'id',
        businessRules: {},
        handoverPolicy: {},
      });

      await repo.deleteProfile(tenantId, profile.id);
      const found = await repo.getProfile(tenantId, profile.id);
      expect(found).toBeNull();
    });
  });

  describe('Agent Sessions', () => {
    it('should create session', async () => {
      const profile = await repo.createProfile(tenantId, {
        name: 'Bot',
        useCase: 'support',
        status: 'ACTIVE',
        tone: 'neutral',
        language: 'id',
        businessRules: {},
        handoverPolicy: {},
      });

      const session = await repo.createSession(tenantId, {
        agentProfileId: profile.id,
        conversationId: 'conv-123',
        status: 'ACTIVE',
        context: { customerName: 'John' },
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe('ACTIVE');
      expect(session.startedAt).toBeDefined();
    });

    it('should update session', async () => {
      const profile = await repo.createProfile(tenantId, {
        name: 'Bot',
        useCase: 'support',
        status: 'ACTIVE',
        tone: 'neutral',
        language: 'id',
        businessRules: {},
        handoverPolicy: {},
      });

      const session = await repo.createSession(tenantId, {
        agentProfileId: profile.id,
        conversationId: 'conv-123',
        status: 'ACTIVE',
        context: {},
      });

      const updated = await repo.updateSession(tenantId, session.id, {
        status: 'COMPLETED',
        endedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('COMPLETED');
      expect(updated.endedAt).toBeDefined();
    });
  });

  describe('Tool Policies', () => {
    it('should create tool policy', async () => {
      const policy = await repo.createToolPolicy(tenantId, {
        name: 'send_message',
        allowed: true,
        constraints: { maxPerMinute: 10 },
      });

      expect(policy.id).toBeDefined();
      expect(policy.name).toBe('send_message');
      expect(policy.allowed).toBe(true);
    });

    it('should list tool policies', async () => {
      await repo.createToolPolicy(tenantId, {
        name: 'tool1',
        allowed: true,
        constraints: {},
      });

      await repo.createToolPolicy(tenantId, {
        name: 'tool2',
        allowed: false,
        constraints: {},
      });

      const policies = await repo.listToolPolicies(tenantId);
      expect(policies).toHaveLength(2);
    });

    it('should update tool policy', async () => {
      const policy = await repo.createToolPolicy(tenantId, {
        name: 'test_tool',
        allowed: false,
        constraints: {},
      });

      const updated = await repo.updateToolPolicy(tenantId, policy.id, {
        allowed: true,
        constraints: { maxPerMinute: 5 },
      });

      expect(updated.allowed).toBe(true);
      expect(updated.constraints).toEqual({ maxPerMinute: 5 });
    });
  });
});
