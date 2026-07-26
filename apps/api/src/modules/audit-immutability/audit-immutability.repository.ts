import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  eventType: string;
  actorType: 'user' | 'system' | 'api_key' | 'automation';
  actorId: string;
  resourceType: string;
  resourceId: string;
  action: 'create' | 'update' | 'delete' | 'read' | 'execute';
  previousState: Record<string, unknown> | null; // free-form JSONB (schema-less)
  newState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  createdAt: string;
  hash: string;
  previousHash: string | null;
}

export interface AuditIntegrityCheck {
  id: string;
  tenantId: string;
  checkedAt: string;
  checkedBy: string;
  totalEntries: number;
  verifiedEntries: number;
  brokenChains: number;
  firstEntryId: string | null;
  lastEntryId: string | null;
  status: 'passed' | 'failed' | 'partial';
  details: Record<string, unknown>;
}

export abstract class AuditImmutabilityRepository {
  abstract createEntry(entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'hash' | 'previousHash'>): Promise<AuditLogEntry>;
  abstract getEntry(id: string): Promise<AuditLogEntry | null>;
  abstract listEntries(tenantId: string, filters?: { resourceType?: string; resourceId?: string; eventType?: string }): Promise<AuditLogEntry[]>;
  abstract verifyChain(tenantId: string, checkedBy: string): Promise<AuditIntegrityCheck>;
}

@Injectable()
export class InMemoryAuditImmutabilityRepository extends AuditImmutabilityRepository {
  private entries: AuditLogEntry[] = [];
  private integrityChecks: AuditIntegrityCheck[] = [];

  private computeHash(entry: Partial<AuditLogEntry>, previousHash: string | null): string {
    const content = JSON.stringify({
      tenantId: entry.tenantId,
      eventType: entry.eventType,
      actorType: entry.actorType,
      actorId: entry.actorId,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      action: entry.action,
      previousState: entry.previousState,
      newState: entry.newState,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      previousHash,
    });
    return createHash('sha256').update(content).digest('hex');
  }

  async createEntry(entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'hash' | 'previousHash'>): Promise<AuditLogEntry> {
    const createdAt = new Date().toISOString();
    const previousEntry = this.entries[this.entries.length - 1];
    const previousHash = previousEntry ? previousEntry.hash : null;
    const hash = this.computeHash({ ...entry, createdAt }, previousHash);

    const newEntry: AuditLogEntry = {
      ...entry,
      id: randomUUID(),
      createdAt,
      hash,
      previousHash,
    };

    this.entries.push(newEntry);
    return newEntry;
  }

  async getEntry(id: string): Promise<AuditLogEntry | null> {
    return this.entries.find(e => e.id === id) || null;
  }

  async listEntries(tenantId: string, filters?: { resourceType?: string; resourceId?: string; eventType?: string }): Promise<AuditLogEntry[]> {
    return this.entries.filter(e => {
      if (e.tenantId !== tenantId) return false;
      if (filters?.resourceType && e.resourceType !== filters.resourceType) return false;
      if (filters?.resourceId && e.resourceId !== filters.resourceId) return false;
      if (filters?.eventType && e.eventType !== filters.eventType) return false;
      return true;
    });
  }

  async verifyChain(tenantId: string, checkedBy: string): Promise<AuditIntegrityCheck> {
    const tenantEntries = this.entries.filter(e => e.tenantId === tenantId);
    let verifiedEntries = 0;
    let brokenChains = 0;

    for (let i = 0; i < tenantEntries.length; i++) {
      const entry = tenantEntries[i];
      if (!entry) continue;
      const prevEntry = i === 0 ? undefined : tenantEntries[i - 1];
      const expectedPreviousHash = prevEntry ? prevEntry.hash : null;
      const expectedHash = this.computeHash(entry, expectedPreviousHash);

      if (entry.hash === expectedHash && entry.previousHash === expectedPreviousHash) {
        verifiedEntries++;
      } else {
        brokenChains++;
      }
    }

    const check: AuditIntegrityCheck = {
      id: randomUUID(),
      tenantId,
      checkedAt: new Date().toISOString(),
      checkedBy,
      totalEntries: tenantEntries.length,
      verifiedEntries,
      brokenChains,
      firstEntryId: tenantEntries[0]?.id || null,
      lastEntryId: tenantEntries[tenantEntries.length - 1]?.id || null,
      status: brokenChains === 0 ? 'passed' : 'failed',
      details: { brokenChains },
    };

    this.integrityChecks.push(check);
    return check;
  }
}
