import postgres from 'postgres';
import { afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { PostgresRealtimeEventStore } from '../src/realtime/event-store';
import { DOMAIN_IDS, seedFoundation } from './fixtures';

/**
 * Fase 1 (R-16): the realtime replay window must be durable and tenant-scoped.
 *
 * These fail if the window stops surviving a process boundary, if a cursor gap
 * stops being detectable, or if one tenant can observe another tenant's stream.
 */

const TENANT_A = DOMAIN_IDS.tenantA;
const TENANT_B = DOMAIN_IDS.tenantB;
const PRINCIPAL_A = DOMAIN_IDS.userA;

function event(id: string, version?: number) {
  return {
    aggregateId: 'conv-1',
    data: { id },
    event: 'message.appended',
    id,
    ...(version === undefined ? {} : { version }),
  };
}

describe('durable realtime replay window', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      await admin`DELETE FROM chai.realtime_event`;
    } finally {
      await admin.end();
    }
  });

  it('replays after a cursor and survives a new store instance', async () => {
    const database = createDatabase(workerDatabaseUrl);
    try {
      const writer = new PostgresRealtimeEventStore(database, PRINCIPAL_A);
      await writer.append(TENANT_A, event('1', 1));
      await writer.append(TENANT_A, event('2', 2));
      await writer.append(TENANT_A, event('3', 3));

      // A fresh instance stands in for a restarted or second gateway replica.
      const reader = new PostgresRealtimeEventStore(database, PRINCIPAL_A);
      const replayed = await reader.replay(TENANT_A, '1', 100);
      expect(replayed.map((row) => row.id)).toEqual(['2', '3']);
      expect(replayed[0]?.version).toBe(2);
      expect(replayed[0]?.aggregateId).toBe('conv-1');
    } finally {
      await database.end();
    }
  });

  it('reports an unknown cursor as a gap', async () => {
    const database = createDatabase(workerDatabaseUrl);
    try {
      const store = new PostgresRealtimeEventStore(database, PRINCIPAL_A);
      await store.append(TENANT_A, event('1', 1));

      expect(await store.hasGap(TENANT_A, 'never-seen')).toBe(true);
      expect(await store.hasGap(TENANT_A, '1')).toBe(false);
    } finally {
      await database.end();
    }
  });

  it('never leaks a stream across tenants', async () => {
    const database = createDatabase(workerDatabaseUrl);
    try {
      const store = new PostgresRealtimeEventStore(database, PRINCIPAL_A);
      await store.append(TENANT_A, event('a-1', 1));
      await store.append(TENANT_B, event('b-1', 1));

      const a = await store.replay(TENANT_A, null, 100);
      const b = await store.replay(TENANT_B, null, 100);
      expect(a.map((row) => row.id)).toEqual(['a-1']);
      expect(b.map((row) => row.id)).toEqual(['b-1']);
      // A cursor from the other tenant is simply unknown here.
      expect(await store.hasGap(TENANT_A, 'b-1')).toBe(true);
    } finally {
      await database.end();
    }
  });

  it('collapses a duplicate event id instead of replaying it twice', async () => {
    const database = createDatabase(workerDatabaseUrl);
    try {
      const store = new PostgresRealtimeEventStore(database, PRINCIPAL_A);
      await store.append(TENANT_A, event('dup', 1));
      await store.append(TENANT_A, event('dup', 1));

      const replayed = await store.replay(TENANT_A, null, 100);
      expect(replayed.map((row) => row.id)).toEqual(['dup']);
    } finally {
      await database.end();
    }
  });

  it('prunes the window down to its retention bound', async () => {
    const database = createDatabase(workerDatabaseUrl);
    try {
      const store = new PostgresRealtimeEventStore(database, PRINCIPAL_A, 3);
      for (let index = 0; index < 6; index += 1) {
        await store.append(TENANT_A, event(`e-${index}`, index));
      }

      const pruned = await store.prune(TENANT_A);
      expect(pruned).toBe(3);

      const remaining = await store.replay(TENANT_A, null, 100);
      expect(remaining.map((row) => row.id)).toEqual(['e-3', 'e-4', 'e-5']);
      // An evicted cursor now reads as a gap, so the client is told to refetch.
      expect(await store.hasGap(TENANT_A, 'e-0')).toBe(true);
    } finally {
      await database.end();
    }
  });

  it('stores the event payload as a real jsonb object, not a double-encoded string (MASALAH-01)', async () => {
    const database = createDatabase(workerDatabaseUrl);
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      const store = new PostgresRealtimeEventStore(database, PRINCIPAL_A);
      await store.append(TENANT_A, event('jsonb-probe', 1));

      const rows = await admin<{ typeof: string; val: string | null }[]>`
        SELECT jsonb_typeof(payload) AS typeof, payload ->> 'id' AS val
        FROM chai.realtime_event
        WHERE event_id = 'jsonb-probe'
      `;

      // A double-encoded write reads back as jsonb_typeof = 'string' and
      // `->> 'key'` = NULL for every key: this is the regression 0072 repairs.
      expect(rows[0]?.typeof).toBe('object');
      expect(rows[0]?.val).toBe('jsonb-probe');
    } finally {
      await admin.end();
      await database.end();
    }
  });
});
