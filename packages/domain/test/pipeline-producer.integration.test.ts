import postgres from 'postgres';
import { afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase, withTenantTransaction } from '@chai/database';

import {
  claimIdempotentOperation,
  pruneExpiredIdempotencyRecords,
  reconcileOperation,
  readOperation,
  requestHash,
  settleOperation,
} from '../src/idempotency/store';
import { inboxPayloadHash, recordInboxEvent } from '../src/inbox/producer';
import {
  appendOutboxEvent,
  commitBusinessMutation,
} from '../src/outbox/producer';
import {
  DOMAIN_IDS,
  resetDispatcherTables,
  seedFoundation,
} from './fixtures';

/**
 * Fase 1 regression: the producer half of the pipeline.
 *
 * These fail if the inbox stops deduplicating provider redeliveries (GAP-003),
 * if a business mutation can commit without its audit entry and event
 * (ADR-007 / GAP-004), or if an idempotency key stops being bound to the hash of
 * the request that created it (GAP-006).
 */

const TENANT_A = DOMAIN_IDS.tenantA;
const TENANT_B = DOMAIN_IDS.tenantB;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const PROVIDER_ACCOUNT = DOMAIN_IDS.providerAccountA;

const contextA = { principalId: PRINCIPAL_A, tenantId: TENANT_A };
const contextB = { principalId: PRINCIPAL_A, tenantId: TENANT_B };

describe('inbox producer', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetDispatcherTables(adminDatabaseUrl);
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      await admin`DELETE FROM chai.idempotency_record`;
      await admin`DELETE FROM chai.operation_execution`;
      await admin`DELETE FROM chai.audit_log`;
    } finally {
      await admin.end();
    }
  });

  it('records a verified event as PENDING with an integrity hash', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      const recorded = await withTenantTransaction(database, contextA, (tx) =>
        recordInboxEvent(tx, {
          externalEventId: 'evt-1',
          payload: '{"message":"hello"}',
          payloadReference: 's3://raw/evt-1',
          provider: 'whatsapp-meta',
          providerAccountId: PROVIDER_ACCOUNT,
          tenantId: TENANT_A,
        }),
      );

      expect(recorded.duplicate).toBe(false);
      expect(recorded.payloadHash).toBe(inboxPayloadHash('{"message":"hello"}'));

      const rows = await withTenantTransaction(database, contextA, (tx) =>
        tx<{ status: string }[]>`
          SELECT status FROM chai.inbox_event WHERE id = ${recorded.id}
        `,
      );
      expect(rows[0]?.status).toBe('PENDING');
    } finally {
      await database.end();
    }
  });

  it('reports a provider redelivery as a duplicate without inserting twice', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      const input = {
        externalEventId: 'evt-dup',
        payload: '{"message":"hello"}',
        payloadReference: 's3://raw/evt-dup',
        provider: 'whatsapp-meta',
        providerAccountId: PROVIDER_ACCOUNT,
        tenantId: TENANT_A,
      };
      const first = await withTenantTransaction(database, contextA, (tx) =>
        recordInboxEvent(tx, input),
      );
      const second = await withTenantTransaction(database, contextA, (tx) =>
        recordInboxEvent(tx, input),
      );

      expect(first.duplicate).toBe(false);
      expect(second.duplicate).toBe(true);
      expect(second.id).toBe(first.id);

      const rows = await withTenantTransaction(database, contextA, (tx) =>
        tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM chai.inbox_event
        `,
      );
      expect(rows[0]?.count).toBe(1);
    } finally {
      await database.end();
    }
  });

  it('lets two tenants use the same provider event id independently', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      const shared = {
        externalEventId: 'evt-shared',
        payload: '{"message":"hello"}',
        payloadReference: 's3://raw/evt-shared',
        provider: 'whatsapp-meta',
        providerAccountId: PROVIDER_ACCOUNT,
      };
      const a = await withTenantTransaction(database, contextA, (tx) =>
        recordInboxEvent(tx, { ...shared, tenantId: TENANT_A }),
      );
      const b = await withTenantTransaction(database, contextB, (tx) =>
        recordInboxEvent(tx, { ...shared, tenantId: TENANT_B }),
      );

      expect(a.duplicate).toBe(false);
      expect(b.duplicate).toBe(false);
      expect(b.id).not.toBe(a.id);
    } finally {
      await database.end();
    }
  });
});

describe('business mutation atomicity', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetDispatcherTables(adminDatabaseUrl);
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      await admin`DELETE FROM chai.audit_log`;
    } finally {
      await admin.end();
    }
  });

  it('commits the audit entry and the event with the mutation', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      await withTenantTransaction(database, contextA, (tx) =>
        commitBusinessMutation(tx, {
          describe: () => ({
            audit: {
              action: 'lead.qualified',
              actorId: PRINCIPAL_A,
              resourceType: 'lead',
            },
            events: [
              {
                aggregateId: DOMAIN_IDS.tenantA,
                aggregateType: 'lead',
                aggregateVersion: 1,
                eventType: 'lead.qualified',
                payload: { score: 42 },
              },
            ],
          }),
          mutate: async () => 'ok',
          tenantId: TENANT_A,
        }),
      );

      const counts = await withTenantTransaction(database, contextA, async (tx) => {
        // Scoped to this test's own action/event type: other suites also write
        // audit and outbox rows for this tenant.
        const audit = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM chai.audit_log
          WHERE action = 'lead.qualified'
        `;
        const outbox = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM chai.outbox_event
          WHERE event_type = 'lead.qualified'
        `;
        return { audit: audit[0]?.count, outbox: outbox[0]?.count };
      });

      expect(counts).toEqual({ audit: 1, outbox: 1 });
    } finally {
      await database.end();
    }
  });

  it('rolls the event and audit back when the mutation fails', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      await expect(
        withTenantTransaction(database, contextA, (tx) =>
          commitBusinessMutation(tx, {
            describe: () => ({
              audit: {
                action: 'lead.qualified',
                actorId: PRINCIPAL_A,
                resourceType: 'lead',
              },
              events: [
                {
                  aggregateId: DOMAIN_IDS.tenantA,
                  aggregateType: 'lead',
                  aggregateVersion: 1,
                  eventType: 'lead.qualified',
                  payload: {},
                },
              ],
            }),
            mutate: async () => {
              throw new Error('MUTATION_FAILED');
            },
            tenantId: TENANT_A,
          }),
        ),
      ).rejects.toThrow('MUTATION_FAILED');

      const counts = await withTenantTransaction(database, contextA, async (tx) => {
        // Scoped to this test's own action/event type: other suites also write
        // audit and outbox rows for this tenant.
        const audit = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM chai.audit_log
          WHERE action = 'lead.qualified'
        `;
        const outbox = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM chai.outbox_event
          WHERE event_type = 'lead.qualified'
        `;
        return { audit: audit[0]?.count, outbox: outbox[0]?.count };
      });

      expect(counts).toEqual({ audit: 0, outbox: 0 });
    } finally {
      await database.end();
    }
  });

  it('refuses a mutation that publishes no event', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      await expect(
        withTenantTransaction(database, contextA, (tx) =>
          commitBusinessMutation(tx, {
            describe: () => ({
              audit: {
                action: 'lead.qualified',
                actorId: PRINCIPAL_A,
                resourceType: 'lead',
              },
              events: [],
            }),
            mutate: async () => 'ok',
            tenantId: TENANT_A,
          }),
        ),
      ).rejects.toThrow('BUSINESS_MUTATION_REQUIRES_EVENT');
    } finally {
      await database.end();
    }
  });

  it('keeps outbox rows invisible to another tenant', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      await withTenantTransaction(database, contextA, (tx) =>
        appendOutboxEvent(tx, {
          aggregateId: DOMAIN_IDS.tenantA,
          aggregateType: 'lead',
          aggregateVersion: 1,
          eventType: 'lead.qualified',
          payload: {},
          tenantId: TENANT_A,
        }),
      );

      const visible = await withTenantTransaction(database, contextB, (tx) =>
        tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM chai.outbox_event
          WHERE event_type = 'lead.qualified'
        `,
      );
      expect(visible[0]?.count).toBe(0);
    } finally {
      await database.end();
    }
  });
});

describe('persistent idempotency and operation state', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      await admin`DELETE FROM chai.idempotency_record`;
      await admin`DELETE FROM chai.operation_execution`;
    } finally {
      await admin.end();
    }
  });

  const claim = {
    audience: 'client-portal',
    idempotencyKey: 'order-42',
    operation: 'payment.create',
    request: { amountMinor: 75_000, currency: 'IDR' },
    tenantId: TENANT_A,
  };

  it('is stable against key order in the request hash', () => {
    expect(requestHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      requestHash({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('claims once and replays the settled outcome afterwards', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      const first = await withTenantTransaction(database, contextA, (tx) =>
        claimIdempotentOperation(tx, claim),
      );
      expect(first.outcome).toBe('CLAIMED');
      if (first.outcome !== 'CLAIMED') return;

      await withTenantTransaction(database, contextA, (tx) =>
        settleOperation(tx, {
          operationId: first.operationId,
          recordId: first.recordId,
          responseReference: 'payment:abc',
          status: 'SUCCEEDED',
        }),
      );

      const replay = await withTenantTransaction(database, contextA, (tx) =>
        claimIdempotentOperation(tx, claim),
      );
      expect(replay.outcome).toBe('REPLAY');
      if (replay.outcome !== 'REPLAY') return;
      expect(replay.status).toBe('SUCCEEDED');
      expect(replay.responseReference).toBe('payment:abc');
      expect(replay.operationId).toBe(first.operationId);
    } finally {
      await database.end();
    }
  });

  it('reports the same key with a different request as a conflict', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      await withTenantTransaction(database, contextA, (tx) =>
        claimIdempotentOperation(tx, claim),
      );
      const conflicting = await withTenantTransaction(database, contextA, (tx) =>
        claimIdempotentOperation(tx, {
          ...claim,
          request: { amountMinor: 999_999, currency: 'IDR' },
        }),
      );
      expect(conflicting.outcome).toBe('CONFLICT');
    } finally {
      await database.end();
    }
  });

  it('keeps an uncertain result reconcilable instead of retryable', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      const claimed = await withTenantTransaction(database, contextA, (tx) =>
        claimIdempotentOperation(tx, claim),
      );
      if (claimed.outcome !== 'CLAIMED') throw new Error('expected claim');

      await withTenantTransaction(database, contextA, (tx) =>
        settleOperation(tx, {
          operationId: claimed.operationId,
          recordId: claimed.recordId,
          status: 'UNKNOWN_RESULT',
        }),
      );

      const uncertain = await withTenantTransaction(database, contextA, (tx) =>
        readOperation(tx, claimed.operationId),
      );
      expect(uncertain?.status).toBe('UNKNOWN_RESULT');
      expect(uncertain?.reconciledAt).toBeNull();

      // An expiry sweep must not forget a key whose real outcome is unknown,
      // otherwise a late redelivery would create a second charge.
      const pruned = await withTenantTransaction(database, contextA, (tx) =>
        pruneExpiredIdempotencyRecords(tx),
      );
      expect(pruned).toBe(0);

      await withTenantTransaction(database, contextA, (tx) =>
        reconcileOperation(tx, {
          operationId: claimed.operationId,
          providerReference: 'provider:tx-1',
          recordId: claimed.recordId,
          status: 'SUCCEEDED',
        }),
      );

      const settled = await withTenantTransaction(database, contextA, (tx) =>
        readOperation(tx, claimed.operationId),
      );
      expect(settled?.status).toBe('SUCCEEDED');
      expect(settled?.reconciledAt).not.toBeNull();
    } finally {
      await database.end();
    }
  });

  it('prunes only settled records once expired', async () => {
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      const claimed = await withTenantTransaction(database, contextA, (tx) =>
        claimIdempotentOperation(tx, { ...claim, ttlMs: 1 }),
      );
      if (claimed.outcome !== 'CLAIMED') throw new Error('expected claim');
      await withTenantTransaction(database, contextA, (tx) =>
        settleOperation(tx, {
          operationId: claimed.operationId,
          recordId: claimed.recordId,
          status: 'SUCCEEDED',
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 20));
      const pruned = await withTenantTransaction(database, contextA, (tx) =>
        pruneExpiredIdempotencyRecords(tx),
      );
      expect(pruned).toBe(1);
    } finally {
      await database.end();
    }
  });
});
