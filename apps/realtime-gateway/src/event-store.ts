import type { ServerSentEvent } from '@chai/contracts';

export interface TenantEventStream {
  append(event: ServerSentEvent): void;
  eventsAfter(cursor: string | null, limit: number): ServerSentEvent[];
  latest(limit: number): ServerSentEvent[];
}

/**
 * Replay-window contract shared by the in-memory and Postgres stores.
 *
 * Async on purpose: the durable implementation talks to the database, and the
 * SSE handler must not be written against a synchronous-only store.
 */
export interface RealtimeEventStore {
  append(tenantId: string, event: ServerSentEvent): Promise<void>;
  hasGap(tenantId: string, cursor: string): Promise<boolean>;
  replay(
    tenantId: string,
    cursor: string | null,
    limit: number,
  ): Promise<ServerSentEvent[]>;
}

const BOUND = 500;

class BoundedStream implements TenantEventStream {
  private readonly events: ServerSentEvent[] = [];

  append(event: ServerSentEvent): void {
    this.events.push(event);
    if (this.events.length > BOUND) {
      this.events.splice(0, this.events.length - BOUND);
    }
  }

  eventsAfter(cursor: string | null, limit: number): ServerSentEvent[] {
    if (cursor === null) {
      return this.events.slice(-limit);
    }
    const index = this.events.findIndex((event) => event.id === cursor);
    if (index === -1) {
      // Cursor predates retention or is unknown → caller must refetch.
      return [];
    }
    return this.events.slice(index + 1, index + 1 + limit);
  }

  latest(limit: number): ServerSentEvent[] {
    return this.events.slice(-limit);
  }
}

/**
 * In-memory per-tenant event store with bounded retention.
 *
 * Kept as the default for local runs and tests: it needs no database and makes
 * the replay contract easy to exercise. Production wires
 * {@link PostgresRealtimeEventStore} instead, which survives a restart and is
 * shared across replicas.
 */
export class EventStore implements RealtimeEventStore {
  private readonly streams = new Map<string, TenantEventStream>();

  async append(tenantId: string, event: ServerSentEvent): Promise<void> {
    this.streamFor(tenantId).append(event);
  }

  async replay(
    tenantId: string,
    cursor: string | null,
    limit: number,
  ): Promise<ServerSentEvent[]> {
    return this.streamFor(tenantId).eventsAfter(cursor, limit);
  }

  async hasGap(tenantId: string, cursor: string): Promise<boolean> {
    const after = this.streamFor(tenantId).eventsAfter(cursor, 1);
    return (
      after.length === 0 &&
      this.streamFor(tenantId).latest(1).some((event) => event.id !== cursor)
    );
  }

  private streamFor(tenantId: string): TenantEventStream {
    let stream = this.streams.get(tenantId);
    if (!stream) {
      stream = new BoundedStream();
      this.streams.set(tenantId, stream);
    }
    return stream;
  }
}
