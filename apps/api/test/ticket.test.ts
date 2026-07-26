import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTicketRepository } from '../src/modules/ticket/ticket.repository';

describe('TicketRepository', () => {
  let repo: InMemoryTicketRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryTicketRepository();
  });

  describe('Tickets', () => {
    it('should create ticket', async () => {
      const ticket = await repo.createTicket(tenantId, {
        subject: 'Login Issue',
        description: 'Cannot login to dashboard',
        status: 'OPEN',
        priority: 'HIGH',
        contactId: 'contact-123',
        conversationId: null,
        assignedTo: null,
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      expect(ticket.id).toBeDefined();
      expect(ticket.subject).toBe('Login Issue');
      expect(ticket.status).toBe('OPEN');
      expect(ticket.priority).toBe('HIGH');
    });

    it('should list tickets by tenant', async () => {
      await repo.createTicket(tenantId, {
        subject: 'Issue 1',
        description: 'Description 1',
        status: 'OPEN',
        priority: 'LOW',
        contactId: 'contact-1',
        conversationId: null,
        assignedTo: null,
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      await repo.createTicket(tenantId, {
        subject: 'Issue 2',
        description: 'Description 2',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        contactId: 'contact-2',
        conversationId: null,
        assignedTo: 'agent-1',
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      const tickets = await repo.listTickets(tenantId);
      expect(tickets).toHaveLength(2);
    });

    it('should update ticket status', async () => {
      const ticket = await repo.createTicket(tenantId, {
        subject: 'Test Ticket',
        description: 'Test',
        status: 'OPEN',
        priority: 'MEDIUM',
        contactId: 'contact-1',
        conversationId: null,
        assignedTo: null,
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      const updated = await repo.updateTicket(tenantId, ticket.id, {
        status: 'IN_PROGRESS',
        assignedTo: 'agent-1',
      });

      expect(updated.status).toBe('IN_PROGRESS');
      expect(updated.assignedTo).toBe('agent-1');
    });

    it('should resolve ticket', async () => {
      const ticket = await repo.createTicket(tenantId, {
        subject: 'Test Ticket',
        description: 'Test',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        contactId: 'contact-1',
        conversationId: null,
        assignedTo: 'agent-1',
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      const updated = await repo.updateTicket(tenantId, ticket.id, {
        status: 'RESOLVED',
        resolvedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('RESOLVED');
      expect(updated.resolvedAt).toBeDefined();
    });
  });

  describe('Ticket Comments', () => {
    it('should create comment', async () => {
      const ticket = await repo.createTicket(tenantId, {
        subject: 'Test Ticket',
        description: 'Test',
        status: 'OPEN',
        priority: 'MEDIUM',
        contactId: 'contact-1',
        conversationId: null,
        assignedTo: null,
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      const comment = await repo.createComment(tenantId, {
        ticketId: ticket.id,
        authorId: 'agent-1',
        isInternal: false,
        body: 'Looking into this issue',
      });

      expect(comment.id).toBeDefined();
      expect(comment.ticketId).toBe(ticket.id);
      expect(comment.body).toBe('Looking into this issue');
    });

    it('should create internal comment', async () => {
      const ticket = await repo.createTicket(tenantId, {
        subject: 'Test Ticket',
        description: 'Test',
        status: 'OPEN',
        priority: 'MEDIUM',
        contactId: 'contact-1',
        conversationId: null,
        assignedTo: null,
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      const comment = await repo.createComment(tenantId, {
        ticketId: ticket.id,
        authorId: 'agent-1',
        isInternal: true,
        body: 'Internal note: checking logs',
      });

      expect(comment.isInternal).toBe(true);
    });

    it('should list ticket comments', async () => {
      const ticket = await repo.createTicket(tenantId, {
        subject: 'Test Ticket',
        description: 'Test',
        status: 'OPEN',
        priority: 'MEDIUM',
        contactId: 'contact-1',
        conversationId: null,
        assignedTo: null,
        category: null,
        tags: [],
        slaDefinitionId: null,
      });

      await repo.createComment(tenantId, {
        ticketId: ticket.id,
        authorId: 'agent-1',
        isInternal: false,
        body: 'Comment 1',
      });

      await repo.createComment(tenantId, {
        ticketId: ticket.id,
        authorId: 'agent-2',
        isInternal: false,
        body: 'Comment 2',
      });

      const comments = await repo.listComments(tenantId, ticket.id);
      expect(comments).toHaveLength(2);
    });
  });
});
