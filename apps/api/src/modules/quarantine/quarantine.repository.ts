import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface QuarantineEntry {
  id: string;
  tenantId: string | null;
  sourceType: 'webhook' | 'provider_event' | 'unknown_payload';
  sourceIdentifier: string | null;
  rawPayload: Record<string, unknown>; // free-form JSONB (schema-less)
  redactedPayload: Record<string, unknown> | null;
  redactionOrder: Record<string, unknown> | null;
  reason: string;
  status: 'pending' | 'reviewed' | 'released' | 'rejected' | 'expired';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  retentionUntil: string;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuarantineAccessLog {
  id: string;
  quarantineEntryId: string;
  accessedBy: string;
  accessType: 'view' | 'release' | 'reject' | 'export';
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
  createdAt: string;
}

export abstract class QuarantineRepository {
  abstract listEntries(tenantId: string | null, status?: string): Promise<QuarantineEntry[]>;
  abstract getEntry(id: string): Promise<QuarantineEntry | null>;
  abstract createEntry(entry: Omit<QuarantineEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>): Promise<QuarantineEntry>;
  abstract updateEntry(id: string, update: Partial<QuarantineEntry>): Promise<QuarantineEntry>;
  abstract deleteEntry(id: string): Promise<void>;
  abstract logAccess(log: Omit<QuarantineAccessLog, 'id' | 'createdAt'>): Promise<QuarantineAccessLog>;
  abstract listAccessLogs(entryId: string): Promise<QuarantineAccessLog[]>;
}

@Injectable()
export class InMemoryQuarantineRepository extends QuarantineRepository {
  private entries = new Map<string, QuarantineEntry>();
  private accessLogs: QuarantineAccessLog[] = [];

  async listEntries(tenantId: string | null, status?: string): Promise<QuarantineEntry[]> {
    return Array.from(this.entries.values()).filter(
      e => (tenantId === null || e.tenantId === tenantId) && (!status || e.status === status)
    );
  }

  async getEntry(id: string): Promise<QuarantineEntry | null> {
    return this.entries.get(id) || null;
  }

  async createEntry(entry: Omit<QuarantineEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>): Promise<QuarantineEntry> {
    const now = new Date().toISOString();
    const created = { ...entry, id: randomUUID(), accessCount: 0, lastAccessedAt: null, createdAt: now, updatedAt: now };
    this.entries.set(created.id, created);
    return created;
  }

  async updateEntry(id: string, update: Partial<QuarantineEntry>): Promise<QuarantineEntry> {
    const existing = this.entries.get(id);
    if (!existing) throw new Error('Quarantine entry not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.entries.set(id, updated);
    return updated;
  }

  async deleteEntry(id: string): Promise<void> {
    if (!this.entries.has(id)) throw new Error('Quarantine entry not found');
    this.entries.delete(id);
  }

  async logAccess(log: Omit<QuarantineAccessLog, 'id' | 'createdAt'>): Promise<QuarantineAccessLog> {
    const created = { ...log, id: randomUUID(), createdAt: new Date().toISOString() };
    this.accessLogs.push(created);
    
    // Update access count
    const entry = this.entries.get(log.quarantineEntryId);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessedAt = created.createdAt;
    }
    
    return created;
  }

  async listAccessLogs(entryId: string): Promise<QuarantineAccessLog[]> {
    return this.accessLogs.filter(l => l.quarantineEntryId === entryId);
  }
}
