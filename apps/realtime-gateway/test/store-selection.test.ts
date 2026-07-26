import { describe, expect, it } from 'vitest';

import { PostgresRealtimeEventStore } from '@chai/domain';

import { EventStore } from '../src/event-store';
import { resolveEventStore } from '../src/main';

/**
 * Release blocker guard: the replicated gateway must NOT keep its replay window
 * in process memory. These fail if the store selection silently falls back to
 * the in-memory `EventStore` in production, or if the process is allowed to
 * start without a shared, durable store.
 */
describe('realtime gateway store selection', () => {
  it('uses the shared PostgresRealtimeEventStore when DATABASE_URL is set', async () => {
    // postgres-js connects lazily, so building the handle never opens a socket.
    const { database, store } = resolveEventStore({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/chai',
    });
    try {
      expect(store).toBeInstanceOf(PostgresRealtimeEventStore);
      // The in-memory store would defeat the purpose across replicas.
      expect(store).not.toBeInstanceOf(EventStore);
    } finally {
      await database.end({ timeout: 0 });
    }
  });

  it('refuses to start without DATABASE_URL instead of degrading to in-memory', () => {
    expect(() => resolveEventStore({})).toThrow(/DATABASE_URL/);
  });
});
