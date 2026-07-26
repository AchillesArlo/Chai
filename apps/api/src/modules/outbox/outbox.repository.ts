import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface OutboxEvent {
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
  status: 'pending' | 'published' | 'failed' | 'expired';
  retryCount: number;
  maxRetries: number;
  publishedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventSubscription {
  id: string;
  tenantId: string;
  name: string;
  eventTypes: string[];
  endpointUrl: string;
  secretKey: string;
  active: boolean;
  retryPolicy: Record<string, unknown>; // free-form JSONB (schema-less)
  lastDeliveredAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class OutboxRepository {
  abstract listEvents(tenantId: string, status?: string): Promise<OutboxEvent[]>;
  abstract getEvent(tenantId: string, id: string): Promise<OutboxEvent | null>;
  abstract createEvent(tenantId: string, event: Omit<OutboxEvent, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<OutboxEvent>;
  abstract updateEvent(tenantId: string, id: string, update: Partial<OutboxEvent>): Promise<OutboxEvent>;
  abstract deleteEvent(tenantId: string, id: string): Promise<void>;

  abstract listSubscriptions(tenantId: string): Promise<EventSubscription[]>;
  abstract getSubscription(tenantId: string, id: string): Promise<EventSubscription | null>;
  abstract createSubscription(tenantId: string, subscription: Omit<EventSubscription, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<EventSubscription>;
  abstract updateSubscription(tenantId: string, id: string, update: Partial<EventSubscription>): Promise<EventSubscription>;
  abstract deleteSubscription(tenantId: string, id: string): Promise<void>;
}

@Injectable()
export class InMemoryOutboxRepository extends OutboxRepository {
  private events = new Map<string, OutboxEvent>();
  private subscriptions = new Map<string, EventSubscription>();

  async listEvents(tenantId: string, status?: string): Promise<OutboxEvent[]> {
    return Array.from(this.events.values()).filter(
      e => e.tenantId === tenantId && (!status || e.status === status)
    );
  }

  async getEvent(tenantId: string, id: string): Promise<OutboxEvent | null> {
    const e = this.events.get(id);
    return e && e.tenantId === tenantId ? e : null;
  }

  async createEvent(tenantId: string, event: Omit<OutboxEvent, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<OutboxEvent> {
    const now = new Date().toISOString();
    const created = { ...event, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.events.set(created.id, created);
    return created;
  }

  async updateEvent(tenantId: string, id: string, update: Partial<OutboxEvent>): Promise<OutboxEvent> {
    const existing = this.events.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Outbox event not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.events.set(id, updated);
    return updated;
  }

  async deleteEvent(tenantId: string, id: string): Promise<void> {
    const existing = this.events.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Outbox event not found');
    this.events.delete(id);
  }

  async listSubscriptions(tenantId: string): Promise<EventSubscription[]> {
    return Array.from(this.subscriptions.values()).filter(s => s.tenantId === tenantId);
  }

  async getSubscription(tenantId: string, id: string): Promise<EventSubscription | null> {
    const s = this.subscriptions.get(id);
    return s && s.tenantId === tenantId ? s : null;
  }

  async createSubscription(tenantId: string, subscription: Omit<EventSubscription, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<EventSubscription> {
    const now = new Date().toISOString();
    const created = { ...subscription, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.subscriptions.set(created.id, created);
    return created;
  }

  async updateSubscription(tenantId: string, id: string, update: Partial<EventSubscription>): Promise<EventSubscription> {
    const existing = this.subscriptions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Event subscription not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.subscriptions.set(id, updated);
    return updated;
  }

  async deleteSubscription(tenantId: string, id: string): Promise<void> {
    const existing = this.subscriptions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Event subscription not found');
    this.subscriptions.delete(id);
  }
}
