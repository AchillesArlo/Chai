import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimOutboxBatch,
  markOutboxEventPublished,
  retryOutboxEvent,
} from '../src/outbox/dispatcher';
import {
  DOMAIN_IDS,
  fetchOutboxStatus,
  resetDispatcherTables,
  seedFoundation,
  seedOutboxEvent,
} from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const OUTBOX_ID_A = '01890f47-9b3c-7cc2-98e8-123456789231';
const OUTBOX_ID_B = '01890f47-9b3c-7cc2-98e8-123456789232';

const tenantContext = {
  principalId: PRINCIPAL_A,
  tenantId: TENANT_A,
};

describe('outbox dispatcher — publish-ack and dead-letter guarantees', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  // Clean BEFORE as well as after. The integration suite shares one database
  // across test files (fileParallelism is off, so they run in sequence), and
  // earlier files — conversations/leads commit business mutations, which write
  // outbox rows via commitBusinessMutation — leave pending events behind.
  // claimOutboxBatch(limit: 10) then claims those too, so `toHaveLength(1)`
  // failed intermittently with "got 8". Resetting first makes this file's
  // starting state deterministic regardless of what ran before it.
  beforeEach(async () => {
    await resetDispatcherTables(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetDispatcherTables(adminDatabaseUrl);
  });

  it('claims a pending event under a lease and keeps the DB authoritative', async () => {
    await seedOutboxEvent(adminDatabaseUrl, {
      id: OUTBOX_ID_A,
      tenantId: TENANT_A,
      eventType: 'conversation.started',
      aggregateType: 'conversation',
      aggregateId: '01890f47-9b3c-7cc2-98e8-123456789240',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      const claimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimOutboxBatch(tx, { leaseMs: 5_000, limit: 10 }),
      );

      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.id).toBe(OUTBOX_ID_A);
      expect(claimed[0]?.eventType).toBe('conversation.started');

      const after = await fetchOutboxStatus(adminDatabaseUrl, OUTBOX_ID_A);
      expect(after.status).toBe('PROCESSING');
      expect(after.attempts).toBe(1);
      expect(after.leaseUntil).not.toBeNull();
    } finally {
      await worker.end();
    }
  });

  it('marks an event PUBLISHED only after the broker acknowledgement is persisted', async () => {
    await seedOutboxEvent(adminDatabaseUrl, {
      id: OUTBOX_ID_A,
      tenantId: TENANT_A,
      eventType: 'message.delivered',
      aggregateType: 'message',
      aggregateId: '01890f47-9b3c-7cc2-98e8-123456789241',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await withTenantTransaction(worker, tenantContext, (tx) =>
        claimOutboxBatch(tx, { leaseMs: 5_000, limit: 10 }),
      );
      await withTenantTransaction(worker, tenantContext, (tx) =>
        markOutboxEventPublished(tx, OUTBOX_ID_A),
      );

      const after = await fetchOutboxStatus(adminDatabaseUrl, OUTBOX_ID_A);
      expect(after.status).toBe('PUBLISHED');
      expect(after.publishedAt).not.toBeNull();
    } finally {
      await worker.end();
    }
  });

  it('survives a crash after broker ack but before persist by re-claiming and converging once', async () => {
    await seedOutboxEvent(adminDatabaseUrl, {
      id: OUTBOX_ID_A,
      tenantId: TENANT_A,
      eventType: 'message.delivered',
      aggregateType: 'message',
      aggregateId: '01890f47-9b3c-7cc2-98e8-123456789242',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      // Worker claims, broker accepts, worker dies before markOutboxEventPublished.
      await withTenantTransaction(worker, tenantContext, (tx) =>
        claimOutboxBatch(tx, { leaseMs: 30_000, limit: 10 }),
      );

      // Simulate lease expiry during the crash.
      const postgres = (await import('postgres')).default;
      const force = postgres(adminDatabaseUrl, { max: 1 });
      try {
        await force`UPDATE chai.outbox_event SET lease_until = now() - interval '1 second' WHERE id = ${OUTBOX_ID_A}`;
      } finally {
        await force.end();
      }

      // Restart path: stale reclaim, fresh claim, then persist the acknowledgement.
      await withTenantTransaction(worker, tenantContext, (tx) =>
        retryOutboxEvent(tx, OUTBOX_ID_A, {
          maxAttempts: 5,
          retryBackoffMs: 0,
        }),
      );
      const reprocessed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimOutboxBatch(tx, { leaseMs: 5_000, limit: 10 }),
      );
      expect(reprocessed).toHaveLength(1);
      expect(reprocessed[0]?.id).toBe(OUTBOX_ID_A);

      await withTenantTransaction(worker, tenantContext, (tx) =>
        markOutboxEventPublished(tx, OUTBOX_ID_A),
      );

      const after = await fetchOutboxStatus(adminDatabaseUrl, OUTBOX_ID_A);
      expect(after.status).toBe('PUBLISHED');
    } finally {
      await worker.end();
    }
  });

  it('dead-letters an event that exceeds the attempt budget', async () => {
    await seedOutboxEvent(adminDatabaseUrl, {
      id: OUTBOX_ID_A,
      tenantId: TENANT_A,
      eventType: 'message.delivered',
      aggregateType: 'message',
      aggregateId: '01890f47-9b3c-7cc2-98e8-123456789243',
      status: 'RETRY',
      attempts: 5,
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await withTenantTransaction(worker, tenantContext, (tx) =>
        retryOutboxEvent(tx, OUTBOX_ID_A, {
          maxAttempts: 5,
          retryBackoffMs: 0,
        }),
      );

      const after = await fetchOutboxStatus(adminDatabaseUrl, OUTBOX_ID_A);
      expect(after.status).toBe('DEAD_LETTER');
    } finally {
      await worker.end();
    }
  });

  it('orders claims within an aggregate partition so consumers observe a stable sequence', async () => {
    const aggregate = '01890f47-9b3c-7cc2-98e8-123456789244';
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() - 1_000);

    await seedOutboxEvent(adminDatabaseUrl, {
      id: OUTBOX_ID_B,
      tenantId: TENANT_A,
      eventType: 'message.delivered',
      aggregateType: 'message',
      aggregateId: aggregate,
      partitionKey: aggregate,
      availableAt: future,
    });
    await seedOutboxEvent(adminDatabaseUrl, {
      id: OUTBOX_ID_A,
      tenantId: TENANT_A,
      eventType: 'message.delivered',
      aggregateType: 'message',
      aggregateId: aggregate,
      partitionKey: aggregate,
      availableAt: past,
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      const claimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimOutboxBatch(tx, { leaseMs: 5_000, limit: 2 }),
      );

      expect(claimed.map((entry) => entry.id)).toEqual([OUTBOX_ID_A, OUTBOX_ID_B]);
    } finally {
      await worker.end();
    }
  });
});
