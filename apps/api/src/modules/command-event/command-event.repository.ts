import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Command {
  id: string;
  tenantId: string;
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  correlationId: string | null;
  causationId: string | null;
  idempotencyKey: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  deadline: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  result: Record<string, unknown> | null; // free-form JSONB (schema-less)
  createdAt: string;
  updatedAt: string;
}

export interface DomainEvent {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  correlationId: string | null;
  causationId: string | null;
  commandId: string | null;
  createdAt: string;
}

export abstract class CommandEventRepository {
  abstract listCommands(tenantId: string, status?: string): Promise<Command[]>;
  abstract getCommand(tenantId: string, id: string): Promise<Command | null>;
  abstract createCommand(tenantId: string, command: Omit<Command, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Command>;
  abstract updateCommand(tenantId: string, id: string, update: Partial<Command>): Promise<Command>;
  abstract findCommandByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Command | null>;

  abstract listEvents(tenantId: string, aggregateType?: string, aggregateId?: string): Promise<DomainEvent[]>;
  abstract getEvent(id: string): Promise<DomainEvent | null>;
  abstract createEvent(tenantId: string, event: Omit<DomainEvent, 'id' | 'tenantId' | 'createdAt'>): Promise<DomainEvent>;
}

@Injectable()
export class InMemoryCommandEventRepository extends CommandEventRepository {
  private commands = new Map<string, Command>();
  private events = new Map<string, DomainEvent>();

  async listCommands(tenantId: string, status?: string): Promise<Command[]> {
    return Array.from(this.commands.values()).filter(
      c => c.tenantId === tenantId && (!status || c.status === status)
    );
  }

  async getCommand(tenantId: string, id: string): Promise<Command | null> {
    const c = this.commands.get(id);
    return c && c.tenantId === tenantId ? c : null;
  }

  async createCommand(tenantId: string, command: Omit<Command, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Command> {
    const now = new Date().toISOString();
    const created = { ...command, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.commands.set(created.id, created);
    return created;
  }

  async updateCommand(tenantId: string, id: string, update: Partial<Command>): Promise<Command> {
    const existing = this.commands.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Command not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.commands.set(id, updated);
    return updated;
  }

  async findCommandByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Command | null> {
    const found = Array.from(this.commands.values()).find(
      c => c.tenantId === tenantId && c.idempotencyKey === idempotencyKey
    );
    return found || null;
  }

  async listEvents(tenantId: string, aggregateType?: string, aggregateId?: string): Promise<DomainEvent[]> {
    return Array.from(this.events.values()).filter(
      e => e.tenantId === tenantId &&
        (!aggregateType || e.aggregateType === aggregateType) &&
        (!aggregateId || e.aggregateId === aggregateId)
    );
  }

  async getEvent(id: string): Promise<DomainEvent | null> {
    return this.events.get(id) || null;
  }

  async createEvent(tenantId: string, event: Omit<DomainEvent, 'id' | 'tenantId' | 'createdAt'>): Promise<DomainEvent> {
    const created = { ...event, tenantId, id: randomUUID(), createdAt: new Date().toISOString() };
    this.events.set(created.id, created);
    return created;
  }
}
