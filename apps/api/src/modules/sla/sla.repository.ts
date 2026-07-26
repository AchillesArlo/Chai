import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface SLADefinition {
  id: string;
  tenantId: string;
  name: string;
  firstResponseTime: number;
  resolutionTime: number;
  createdAt: string;
  updatedAt: string;
}

export interface SLABreach {
  id: string;
  tenantId: string;
  ticketId: string;
  slaDefinitionId: string;
  breachType: 'FIRST_RESPONSE' | 'RESOLUTION';
  breachedAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

export abstract class SLARepository {
  abstract listDefinitions(tenantId: string): Promise<SLADefinition[]>;
  abstract getDefinition(tenantId: string, id: string): Promise<SLADefinition | null>;
  abstract createDefinition(tenantId: string, definition: Omit<SLADefinition, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<SLADefinition>;
  abstract updateDefinition(tenantId: string, id: string, update: Partial<SLADefinition>): Promise<SLADefinition>;
  abstract deleteDefinition(tenantId: string, id: string): Promise<void>;
  abstract listBreaches(tenantId: string, ticketId?: string): Promise<SLABreach[]>;
  abstract createBreach(tenantId: string, breach: Omit<SLABreach, 'id' | 'tenantId' | 'createdAt'>): Promise<SLABreach>;
  abstract updateBreach(tenantId: string, id: string, update: Partial<SLABreach>): Promise<SLABreach>;
}

@Injectable()
export class InMemorySLARepository extends SLARepository {
  private definitions = new Map<string, SLADefinition>();
  private breaches = new Map<string, SLABreach>();

  async listDefinitions(tenantId: string): Promise<SLADefinition[]> {
    return Array.from(this.definitions.values()).filter(d => d.tenantId === tenantId);
  }

  async getDefinition(tenantId: string, id: string): Promise<SLADefinition | null> {
    const d = this.definitions.get(id);
    return d && d.tenantId === tenantId ? d : null;
  }

  async createDefinition(tenantId: string, definition: Omit<SLADefinition, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<SLADefinition> {
    const now = new Date().toISOString();
    const created = { ...definition, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.definitions.set(created.id, created);
    return created;
  }

  async updateDefinition(tenantId: string, id: string, update: Partial<SLADefinition>): Promise<SLADefinition> {
    const existing = this.definitions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('SLA definition not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.definitions.set(id, updated);
    return updated;
  }

  async deleteDefinition(tenantId: string, id: string): Promise<void> {
    const existing = this.definitions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('SLA definition not found');
    this.definitions.delete(id);
  }

  async listBreaches(tenantId: string, ticketId?: string): Promise<SLABreach[]> {
    return Array.from(this.breaches.values()).filter(
      b => b.tenantId === tenantId && (!ticketId || b.ticketId === ticketId)
    );
  }

  async createBreach(tenantId: string, breach: Omit<SLABreach, 'id' | 'tenantId' | 'createdAt'>): Promise<SLABreach> {
    const created = { ...breach, tenantId, id: randomUUID(), createdAt: new Date().toISOString() };
    this.breaches.set(created.id, created);
    return created;
  }

  async updateBreach(tenantId: string, id: string, update: Partial<SLABreach>): Promise<SLABreach> {
    const existing = this.breaches.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('SLA breach not found');
    const updated = { ...existing, ...update };
    this.breaches.set(id, updated);
    return updated;
  }
}
