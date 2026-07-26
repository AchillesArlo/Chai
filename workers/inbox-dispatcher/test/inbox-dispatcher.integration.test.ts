import { createDatabase } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runInboxDispatcher, type InboxClaim, type InboxHandler } from '../src';

import {
  clearInbox,
  fetchInboxStatuses,
  seedInboxEvent,
  seedTenantRoster,
  WORKER_IDS,
} from './helpers';

describe('inbox dispatcher worker — end-to-end convergence', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedTenantRoster(adminDatabaseUrl);
  });

  afterEach(async () => {
    await clearInbox(adminDatabaseUrl);
  });

  it('claims, processes, and acknowledges events to PROCESSED', async () => {
    await seedInboxEvent(adminDatabaseUrl, WORKER_IDS.inboxOne, 'worker-event-one');
    await seedInboxEvent(adminDatabaseUrl, WORKER_IDS.inboxTwo, 'worker-event-two');

    const processed: string[] = [];
    const handler: InboxHandler = {
      async process(claim: InboxClaim) {
        processed.push(claim.id);
        return 'processed';
      },
    };

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runInboxDispatcher({
        database: worker,
        handler,
        iterations: 1,
        options: {
          leaseMs: 5_000,
          limit: 10,
          maxAttempts: 3,
          pollIntervalMs: 10,
          retryBackoffMs: 0,
        },
        tenants: [
          { principalId: WORKER_IDS.userA, tenantId: WORKER_IDS.tenantA },
        ],
      });
    } finally {
      await worker.end();
    }

    expect(processed.sort()).toEqual([WORKER_IDS.inboxOne, WORKER_IDS.inboxTwo].sort());

    const statuses = await fetchInboxStatuses(adminDatabaseUrl);
    expect(statuses.every((row) => row.status === 'PROCESSED')).toBe(true);
  });

  it('retries a handler that reports failure and dead-letters past the budget', async () => {
    await seedInboxEvent(adminDatabaseUrl, WORKER_IDS.inboxOne, 'worker-event-failing');

    const handler: InboxHandler = {
      async process() {
        return 'retry';
      },
    };

    const worker = createDatabase(workerDatabaseUrl);
    try {
      for (let cycle = 0; cycle < 4; cycle += 1) {
        await runInboxDispatcher({
          database: worker,
          handler,
          iterations: 1,
          options: {
            leaseMs: 5_000,
            limit: 10,
            maxAttempts: 3,
            pollIntervalMs: 0,
            retryBackoffMs: 0,
          },
          tenants: [
            { principalId: WORKER_IDS.userA, tenantId: WORKER_IDS.tenantA },
          ],
        });
      }
    } finally {
      await worker.end();
    }

    const statuses = await fetchInboxStatuses(adminDatabaseUrl);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe('DEAD_LETTER');
    expect(statuses[0]?.attempts).toBe(3);
  });
});
