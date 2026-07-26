import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  acknowledgeInboxEvent,
  claimInboxBatch,
  reclaimStaleInboxLeases,
  retryInboxEvent,
} from '../src/inbox/dispatcher';
import {
  DOMAIN_IDS,
  fetchInboxStatus,
  resetDispatcherTables,
  seedFoundation,
  seedInboxEvent,
} from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const INBOX_ID_A = '01890f47-9b3c-7cc2-98e8-123456789221';
const INBOX_ID_B = '01890f47-9b3c-7cc2-98e8-123456789222';
const INBOX_ID_C = '01890f47-9b3c-7cc2-98e8-123456789223';

const tenantContext = {
  principalId: PRINCIPAL_A,
  tenantId: TENANT_A,
};

describe('inbox dispatcher — crash-window guarantees', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetDispatcherTables(adminDatabaseUrl);
  });

  afterAll(async () => {
    // ponytail: connection pools are reaped on process exit; explicit close is overkill here.
  });

  it('claims a pending event under an exclusive database lease', async () => {
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_A,
      tenantId: TENANT_A,
      externalEventId: 'event-claim',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      const claimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 5_000, limit: 10 }),
      );

      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.id).toBe(INBOX_ID_A);
      expect(claimed[0]?.externalEventId).toBe('event-claim');

      const after = await fetchInboxStatus(adminDatabaseUrl, INBOX_ID_A);
      expect(after.status).toBe('PROCESSING');
      expect(after.attempts).toBe(1);
      expect(after.leaseUntil).not.toBeNull();
    } finally {
      await worker.end();
    }
  });

  it('two sequential claims never hand the same event to two workers', async () => {
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_A,
      tenantId: TENANT_A,
      externalEventId: 'event-exclusive',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      const first = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 30_000, limit: 10 }),
      );
      expect(first).toHaveLength(1);

      const second = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 30_000, limit: 10 }),
      );
      expect(second).toHaveLength(0);
    } finally {
      await worker.end();
    }
  });

  it('acknowledges a claimed event to a terminal PROCESSED state', async () => {
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_A,
      tenantId: TENANT_A,
      externalEventId: 'event-ack',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 5_000, limit: 10 }),
      );
      await withTenantTransaction(worker, tenantContext, (tx) =>
        acknowledgeInboxEvent(tx, INBOX_ID_A),
      );

      const after = await fetchInboxStatus(adminDatabaseUrl, INBOX_ID_A);
      expect(after.status).toBe('PROCESSED');
      expect(after.processedAt).not.toBeNull();
    } finally {
      await worker.end();
    }
  });

  it('a duplicate provider event produces one logical record (dedup)', async () => {
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_A,
      tenantId: TENANT_A,
      externalEventId: 'dup-event',
    });
    // Same provider/external identity arrives again — the unique index collapses it.
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_B,
      tenantId: TENANT_A,
      externalEventId: 'dup-event',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      const claimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 5_000, limit: 10 }),
      );

      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.id).toBe(INBOX_ID_A);
    } finally {
      await worker.end();
    }
  });

  it('reclaims an event whose lease expired after a worker crash before ack', async () => {
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_A,
      tenantId: TENANT_A,
      externalEventId: 'event-crash-before-ack',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      // Worker claims then crashes without acknowledging — lease is held in the DB.
      await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 30_000, limit: 10 }),
      );

      // Force the lease into the past to simulate expiry while the worker is dead.
      const admin = await import('postgres');
      const force = admin.default(adminDatabaseUrl, { max: 1 });
      try {
        await force`UPDATE chai.inbox_event SET lease_until = now() - interval '1 second' WHERE id = ${INBOX_ID_A}`;
      } finally {
        await force.end();
      }

      const reclaimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        reclaimStaleInboxLeases(tx),
      );
      expect(reclaimed).toBe(1);

      // After expiry the record is available to a fresh worker.
      const reprocessed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 5_000, limit: 10 }),
      );
      expect(reprocessed).toHaveLength(1);
      expect(reprocessed[0]?.id).toBe(INBOX_ID_A);
      expect(reprocessed[0]?.attempts).toBe(2);

      // Final acknowledgement makes the at-least-once delivery converge.
      await withTenantTransaction(worker, tenantContext, (tx) =>
        acknowledgeInboxEvent(tx, INBOX_ID_A),
      );
      const after = await fetchInboxStatus(adminDatabaseUrl, INBOX_ID_A);
      expect(after.status).toBe('PROCESSED');
    } finally {
      await worker.end();
    }
  });

  it('retries with backoff and dead-letters after exceeding the attempt budget', async () => {
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_A,
      tenantId: TENANT_A,
      externalEventId: 'event-retry',
      status: 'RETRY',
      attempts: 3,
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      // At the attempt ceiling, a retry must transition to DEAD_LETTER.
      await withTenantTransaction(worker, tenantContext, (tx) =>
        retryInboxEvent(tx, INBOX_ID_A, {
          maxAttempts: 3,
          retryBackoffMs: 0,
        }),
      );

      const after = await fetchInboxStatus(adminDatabaseUrl, INBOX_ID_A);
      expect(after.status).toBe('DEAD_LETTER');

      // A fresh event under budget moves to RETRY with a delayed availability.
      await seedInboxEvent(adminDatabaseUrl, {
        id: INBOX_ID_B,
        tenantId: TENANT_A,
        externalEventId: 'event-retry-soft',
        status: 'PROCESSING',
        attempts: 1,
      });
      await withTenantTransaction(worker, tenantContext, (tx) =>
        retryInboxEvent(tx, INBOX_ID_B, {
          maxAttempts: 3,
          retryBackoffMs: 60_000,
        }),
      );
      const soft = await fetchInboxStatus(adminDatabaseUrl, INBOX_ID_B);
      expect(soft.status).toBe('RETRY');
      expect(soft.attempts).toBe(1);
    } finally {
      await worker.end();
    }
  });

  it('claims events in availability order within a tenant partition', async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() - 1_000);

    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_C,
      tenantId: TENANT_A,
      externalEventId: 'event-newer',
      availableAt: future,
    });
    await seedInboxEvent(adminDatabaseUrl, {
      id: INBOX_ID_B,
      tenantId: TENANT_A,
      externalEventId: 'event-older',
      availableAt: past,
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      const claimed = await withTenantTransaction(worker, tenantContext, (tx) =>
        claimInboxBatch(tx, { leaseMs: 5_000, limit: 1 }),
      );

      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.id).toBe(INBOX_ID_B);
    } finally {
      await worker.end();
    }
  });
});
