import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Ticket {
  id: string;
  tenantId: string;
  contactId: string | null;
  conversationId: string | null;
  subject: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';
  assignedTo: string | null;
  category: string | null;
  tags: string[];
  slaDefinitionId: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  tenantId: string;
  authorId: string;
  isInternal: boolean;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export abstract class TicketRepository {
  abstract listTickets(tenantId: string): Promise<Ticket[]>;
  abstract getTicket(tenantId: string, id: string): Promise<Ticket | null>;
  abstract createTicket(tenantId: string, ticket: Omit<Ticket, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'firstResponseAt' | 'resolvedAt' | 'closedAt'>): Promise<Ticket>;
  abstract updateTicket(tenantId: string, id: string, update: Partial<Ticket>): Promise<Ticket>;
  abstract listComments(tenantId: string, ticketId: string): Promise<TicketComment[]>;
  abstract createComment(tenantId: string, comment: Omit<TicketComment, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<TicketComment>;
}

@Injectable()
export class InMemoryTicketRepository extends TicketRepository {
  private tickets = new Map<string, Ticket>();
  private comments = new Map<string, TicketComment>();

  async listTickets(tenantId: string): Promise<Ticket[]> {
    return Array.from(this.tickets.values()).filter(t => t.tenantId === tenantId);
  }

  async getTicket(tenantId: string, id: string): Promise<Ticket | null> {
    const t = this.tickets.get(id);
    return t && t.tenantId === tenantId ? t : null;
  }

  async createTicket(tenantId: string, ticket: Omit<Ticket, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'firstResponseAt' | 'resolvedAt' | 'closedAt'>): Promise<Ticket> {
    const now = new Date().toISOString();
    const created = { ...ticket, tenantId, id: randomUUID(), firstResponseAt: null, resolvedAt: null, closedAt: null, createdAt: now, updatedAt: now };
    this.tickets.set(created.id, created);
    return created;
  }

  async updateTicket(tenantId: string, id: string, update: Partial<Ticket>): Promise<Ticket> {
    const existing = this.tickets.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Ticket not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.tickets.set(id, updated);
    return updated;
  }

  async listComments(tenantId: string, ticketId: string): Promise<TicketComment[]> {
    return Array.from(this.comments.values()).filter(c => c.tenantId === tenantId && c.ticketId === ticketId);
  }

  async createComment(tenantId: string, comment: Omit<TicketComment, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<TicketComment> {
    const now = new Date().toISOString();
    const created = { ...comment, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.comments.set(created.id, created);
    return created;
  }
}
