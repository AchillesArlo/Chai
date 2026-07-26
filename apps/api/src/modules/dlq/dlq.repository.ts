import { Injectable } from '@nestjs/common';

// ponytail: in-memory DLQ store; swap for Postgres when persistence is needed.

/**
 * Dead-letter entry — an event that exceeded retry budget.
 */
export interface DeadLetterEntry {
  id: string;
  tenantId: string;
  source: 'outbox' | 'inbox';
  eventType: string;
  payload: unknown;
  error: string;
  attempts: number;
  originalEventId: string;
  deadLetteredAt: Date;
}

/**
 * DLQ repository — tracks failed events that exceeded retry budget.
 */
@Injectable()
export class DlqRepository {
  private entries: Map<string, DeadLetterEntry> = new Map();

  /**
   * Add an entry to the dead-letter queue.
   */
  add(entry: Omit<DeadLetterEntry, 'id' | 'deadLetteredAt'>): DeadLetterEntry {
    const id = `dlq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: DeadLetterEntry = {
      ...entry,
      deadLetteredAt: new Date(),
      id,
    };
    this.entries.set(id, record);
    return record;
  }

  /**
   * List DLQ entries, optionally filtered by tenant.
   */
  list(tenantId?: string, limit = 50): DeadLetterEntry[] {
    const all = [...this.entries.values()];
    const filtered = tenantId ? all.filter((e) => e.tenantId === tenantId) : all;
    return filtered
      .sort((a, b) => b.deadLetteredAt.getTime() - a.deadLetteredAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get a single DLQ entry by ID.
   */
  get(id: string): DeadLetterEntry | null {
    return this.entries.get(id) ?? null;
  }

  /**
   * Replay a dead-lettered event (removes from DLQ and returns it for reprocessing).
   */
  replay(id: string): DeadLetterEntry | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    this.entries.delete(id);
    return entry;
  }

  /**
   * Permanently delete a DLQ entry.
   */
  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * Get count of DLQ entries, optionally per tenant.
   */
  count(tenantId?: string): number {
    if (!tenantId) return this.entries.size;
    return [...this.entries.values()].filter((e) => e.tenantId === tenantId).length;
  }

  /**
   * Clear all entries (for testing).
   */
  clear(): void {
    this.entries.clear();
  }
}
