import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCommandEventRepository } from '../src/modules/command-event/command-event.repository';

describe('CommandEventRepository', () => {
  let repo: InMemoryCommandEventRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryCommandEventRepository();
  });

  describe('Commands', () => {
    it('should create command', async () => {
      const command = await repo.createCommand(tenantId, {
        commandType: 'create.conversation',
        aggregateType: 'conversation',
        aggregateId: 'conv-123',
        payload: { subject: 'Test' },
        metadata: {},
        correlationId: null,
        causationId: null,
        idempotencyKey: 'key-123',
        status: 'pending',
        deadline: null,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        result: null,
      });

      expect(command.id).toBeDefined();
      expect(command.commandType).toBe('create.conversation');
      expect(command.status).toBe('pending');
    });

    it('should list commands by tenant', async () => {
      await repo.createCommand(tenantId, {
        commandType: 'update.ticket',
        aggregateType: 'ticket',
        aggregateId: 'ticket-1',
        payload: {},
        metadata: {},
        correlationId: null,
        causationId: null,
        idempotencyKey: null,
        status: 'pending',
        deadline: null,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        result: null,
      });

      const commands = await repo.listCommands(tenantId);
      expect(commands).toHaveLength(1);
    });

    it('should find command by idempotency key', async () => {
      await repo.createCommand(tenantId, {
        commandType: 'test.command',
        aggregateType: 'test',
        aggregateId: 'test-1',
        payload: {},
        metadata: {},
        correlationId: null,
        causationId: null,
        idempotencyKey: 'unique-key-123',
        status: 'pending',
        deadline: null,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        result: null,
      });

      const found = await repo.findCommandByIdempotencyKey(tenantId, 'unique-key-123');
      expect(found).toBeDefined();
      expect(found?.idempotencyKey).toBe('unique-key-123');
    });

    it('should update command status', async () => {
      const command = await repo.createCommand(tenantId, {
        commandType: 'test.command',
        aggregateType: 'test',
        aggregateId: 'test-1',
        payload: {},
        metadata: {},
        correlationId: null,
        causationId: null,
        idempotencyKey: null,
        status: 'pending',
        deadline: null,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        result: null,
      });

      const updated = await repo.updateCommand(tenantId, command.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: { success: true },
      });

      expect(updated.status).toBe('completed');
      expect(updated.result).toEqual({ success: true });
    });
  });

  describe('Domain Events', () => {
    it('should create domain event', async () => {
      const event = await repo.createEvent(tenantId, {
        eventType: 'conversation.created',
        aggregateType: 'conversation',
        aggregateId: 'conv-123',
        aggregateVersion: 1,
        payload: { subject: 'Test' },
        metadata: {},
        correlationId: null,
        causationId: null,
        commandId: null,
      });

      expect(event.id).toBeDefined();
      expect(event.eventType).toBe('conversation.created');
      expect(event.aggregateVersion).toBe(1);
    });

    it('should list events by aggregate', async () => {
      await repo.createEvent(tenantId, {
        eventType: 'ticket.updated',
        aggregateType: 'ticket',
        aggregateId: 'ticket-1',
        aggregateVersion: 1,
        payload: {},
        metadata: {},
        correlationId: null,
        causationId: null,
        commandId: null,
      });

      await repo.createEvent(tenantId, {
        eventType: 'ticket.updated',
        aggregateType: 'ticket',
        aggregateId: 'ticket-1',
        aggregateVersion: 2,
        payload: {},
        metadata: {},
        correlationId: null,
        causationId: null,
        commandId: null,
      });

      const events = await repo.listEvents(tenantId, 'ticket', 'ticket-1');
      expect(events).toHaveLength(2);
    });
  });
});
