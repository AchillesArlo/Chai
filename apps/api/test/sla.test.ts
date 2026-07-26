import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySLARepository } from '../src/modules/sla/sla.repository';

describe('SLARepository', () => {
  let repo: InMemorySLARepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemorySLARepository();
  });

  describe('SLA Definitions', () => {
    it('should create SLA definition', async () => {
      const definition = await repo.createDefinition(tenantId, {
        name: 'Premium Support',
        firstResponseTime: 300,
        resolutionTime: 3600,
      });

      expect(definition.id).toBeDefined();
      expect(definition.name).toBe('Premium Support');
      expect(definition.firstResponseTime).toBe(300);
      expect(definition.resolutionTime).toBe(3600);
    });

    it('should list definitions by tenant', async () => {
      await repo.createDefinition(tenantId, {
        name: 'Standard',
        firstResponseTime: 600,
        resolutionTime: 7200,
      });

      await repo.createDefinition(tenantId, {
        name: 'Premium',
        firstResponseTime: 300,
        resolutionTime: 3600,
      });

      const definitions = await repo.listDefinitions(tenantId);
      expect(definitions).toHaveLength(2);
    });

    it('should update definition', async () => {
      const definition = await repo.createDefinition(tenantId, {
        name: 'Test Definition',
        firstResponseTime: 600,
        resolutionTime: 7200,
      });

      const updated = await repo.updateDefinition(tenantId, definition.id, {
        firstResponseTime: 300,
      });

      expect(updated.firstResponseTime).toBe(300);
    });

    it('should delete definition', async () => {
      const definition = await repo.createDefinition(tenantId, {
        name: 'Delete Me',
        firstResponseTime: 600,
        resolutionTime: 7200,
      });

      await repo.deleteDefinition(tenantId, definition.id);
      const found = await repo.getDefinition(tenantId, definition.id);
      expect(found).toBeNull();
    });
  });

  describe('SLA Breaches', () => {
    it('should create breach', async () => {
      const definition = await repo.createDefinition(tenantId, {
        name: 'Standard',
        firstResponseTime: 600,
        resolutionTime: 7200,
      });

      const breach = await repo.createBreach(tenantId, {
        ticketId: 'ticket-123',
        slaDefinitionId: definition.id,
        breachType: 'FIRST_RESPONSE',
        breachedAt: new Date().toISOString(),
        resolvedAt: null,
      });

      expect(breach.id).toBeDefined();
      expect(breach.slaDefinitionId).toBe(definition.id);
      expect(breach.breachType).toBe('FIRST_RESPONSE');
    });

    it('should list breaches by tenant', async () => {
      const definition = await repo.createDefinition(tenantId, {
        name: 'Standard',
        firstResponseTime: 600,
        resolutionTime: 7200,
      });

      await repo.createBreach(tenantId, {
        ticketId: 'ticket-1',
        slaDefinitionId: definition.id,
        breachType: 'FIRST_RESPONSE',
        breachedAt: new Date().toISOString(),
        resolvedAt: null,
      });

      await repo.createBreach(tenantId, {
        ticketId: 'ticket-2',
        slaDefinitionId: definition.id,
        breachType: 'RESOLUTION',
        breachedAt: new Date().toISOString(),
        resolvedAt: null,
      });

      const breaches = await repo.listBreaches(tenantId);
      expect(breaches).toHaveLength(2);
    });

    it('should update breach', async () => {
      const definition = await repo.createDefinition(tenantId, {
        name: 'Standard',
        firstResponseTime: 600,
        resolutionTime: 7200,
      });

      const breach = await repo.createBreach(tenantId, {
        ticketId: 'ticket-1',
        slaDefinitionId: definition.id,
        breachType: 'FIRST_RESPONSE',
        breachedAt: new Date().toISOString(),
        resolvedAt: null,
      });

      const updated = await repo.updateBreach(tenantId, breach.id, {
        resolvedAt: new Date().toISOString(),
      });

      expect(updated.resolvedAt).toBeDefined();
    });
  });
});
