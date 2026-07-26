import { createDatabase } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  runOutboxDispatcher,
  type OutboxClaim,
  type OutboxPublisher,
} from '../src';

import {
  clearOutbox,
  fetchOutboxStatuses,
  seedOutboxEvent,
  seedTenantRoster,
  WORKER_IDS,
} from './helpers';

describe('outbox dispatcher worker — end-to-end publish-ack', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedTenantRoster(adminDatabaseUrl);
  });

  afterEach(async () => {
    await clearOutbox(adminDatabaseUrl);
  });

  it('publishes each event once and marks it PUBLISHED', async () => {
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxOne, 'message.delivered');
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxTwo, 'message.read');

    const published: string[] = [];
    const publisher: OutboxPublisher = {
      async publish(claim: OutboxClaim) {
        published.push(claim.id);
        return 'acked';
      },
    };

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runOutboxDispatcher({
        database: worker,
        iterations: 1,
        options: {
          leaseMs: 5_000,
          limit: 10,
          maxAttempts: 3,
          pollIntervalMs: 10,
          retryBackoffMs: 0,
        },
        publisher,
        tenants: [
          { principalId: WORKER_IDS.userA, tenantId: WORKER_IDS.tenantA },
        ],
      });
    } finally {
      await worker.end();
    }

    expect(published.sort()).toEqual([WORKER_IDS.outboxOne, WORKER_IDS.outboxTwo].sort());

    const statuses = await fetchOutboxStatuses(adminDatabaseUrl);
    expect(statuses.every((row) => row.status === 'PUBLISHED')).toBe(true);
  });

  it('retries a failing publish and dead-letters past the budget', async () => {
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxOne, 'message.delivered');

    const publisher: OutboxPublisher = {
      async publish() {
        return 'failed';
      },
    };

    const worker = createDatabase(workerDatabaseUrl);
    try {
      for (let cycle = 0; cycle < 4; cycle += 1) {
        await runOutboxDispatcher({
          database: worker,
          iterations: 1,
          options: {
            leaseMs: 5_000,
            limit: 10,
            maxAttempts: 3,
            pollIntervalMs: 0,
            retryBackoffMs: 0,
          },
          publisher,
          tenants: [
            { principalId: WORKER_IDS.userA, tenantId: WORKER_IDS.tenantA },
          ],
        });
      }
    } finally {
      await worker.end();
    }

    const statuses = await fetchOutboxStatuses(adminDatabaseUrl);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe('DEAD_LETTER');
    expect(statuses[0]?.attempts).toBe(3);
  });
});
