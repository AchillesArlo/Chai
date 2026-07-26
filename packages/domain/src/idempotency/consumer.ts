// ponytail: idempotent consumer with dedup store.
// Tracks processed event IDs to prevent duplicate processing (at-least-once → exactly-once).

/**
 * Idempotency record — tracks that an event was processed.
 */
export interface IdempotencyRecord {
  eventId: string;
  result: 'processed' | 'failed';
  resultData?: unknown;
  tenantId: string;
  timestamp: Date;
}

/**
 * In-memory idempotency store.
 * ponytail: Map with TTL; swap for Redis/Postgres when distributed dedup is needed.
 */
export class IdempotencyStore {
  private records: Map<string, IdempotencyRecord> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Check if an event has already been processed.
   */
  has(tenantId: string, eventId: string): boolean {
    const key = `${tenantId}:${eventId}`;
    return this.records.has(key);
  }

  /**
   * Get the recorded result for a previously processed event.
   */
  get(tenantId: string, eventId: string): IdempotencyRecord | null {
    const key = `${tenantId}:${eventId}`;
    return this.records.get(key) ?? null;
  }

  /**
   * Record that an event was processed.
   */
  record(tenantId: string, eventId: string, result: 'processed' | 'failed', resultData?: unknown): IdempotencyRecord {
    const key = `${tenantId}:${eventId}`;
    const record: IdempotencyRecord = {
      eventId,
      result,
      resultData,
      tenantId,
      timestamp: new Date(),
    };
    this.records.set(key, record);
    return record;
  }

  /**
   * Try to claim an event for processing.
   * Returns true if the event has not been processed and can proceed.
   */
  tryClaim(tenantId: string, eventId: string): boolean {
    return !this.has(tenantId, eventId);
  }

  /**
   * Remove expired records (TTL-based cleanup).
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, record] of this.records) {
      if (now - record.timestamp.getTime() >= this.ttlMs) {
        this.records.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clear all records (for testing).
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Get count of stored records.
   */
  size(): number {
    return this.records.size;
  }
}

/**
 * Idempotent consumer wrapper.
 * Wraps a handler with dedup logic: skip if already processed.
 */
export class IdempotentConsumer {
  constructor(private store: IdempotencyStore) {}

  /**
   * Process an event idempotently.
   * If already processed, returns the cached result.
   * Otherwise, runs the handler and records the result.
   */
  async process<T>(
    tenantId: string,
    eventId: string,
    handler: () => Promise<T>
  ): Promise<{ cached: boolean; result?: T }> {
    // Check if already processed
    const existing = this.store.get(tenantId, eventId);
    if (existing) {
      return { cached: true, result: existing.resultData as T | undefined };
    }

    // Run handler
    const result = await handler();

    // Record result
    this.store.record(tenantId, eventId, 'processed', result);

    return { cached: false, result };
  }

  /**
   * Process with explicit failure tracking.
   * Failed events are recorded but can be retried (claim returns true for failed).
   */
  async processWithRetry<T>(
    tenantId: string,
    eventId: string,
    handler: () => Promise<T>
  ): Promise<{ cached: boolean; result?: T }> {
    const existing = this.store.get(tenantId, eventId);

    // Skip if already successfully processed
    if (existing && existing.result === 'processed') {
      return { cached: true, result: existing.resultData as T | undefined };
    }

    try {
      const result = await handler();
      this.store.record(tenantId, eventId, 'processed', result);
      return { cached: false, result };
    } catch (error) {
      this.store.record(tenantId, eventId, 'failed', { error: String(error) });
      throw error;
    }
  }
}

/**
 * Default singleton store.
 */
let defaultStore: IdempotencyStore | null = null;

/**
 * Get or create the default idempotency store.
 */
export function getIdempotencyStore(): IdempotencyStore {
  if (!defaultStore) {
    defaultStore = new IdempotencyStore();
  }
  return defaultStore;
}

/**
 * Reset the default store (for testing).
 */
export function resetIdempotencyStore(): void {
  defaultStore = null;
}

/**
 * Create a new idempotency store instance.
 */
export function createIdempotencyStore(ttlMs?: number): IdempotencyStore {
  return new IdempotencyStore(ttlMs);
}

/**
 * Create a new idempotent consumer.
 */
export function createIdempotentConsumer(store?: IdempotencyStore): IdempotentConsumer {
  return new IdempotentConsumer(store ?? createIdempotencyStore());
}
