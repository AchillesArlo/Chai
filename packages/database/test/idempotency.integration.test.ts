import { beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { createDatabase, withTenantTransaction } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

describe('idempotency uniqueness', () => {
  beforeAll(async () => seedFoundation(inject('adminDatabaseUrl')));

  it('rejects duplicate operation keys within a tenant', async () => {
    const database = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      await withTenantTransaction(
        database,
        {
          principalId: DATABASE_IDS.userA,
          tenantId: DATABASE_IDS.tenantA,
        },
        async (transaction) => {
          await transaction`
            INSERT INTO chai.idempotency_record (
              id,
              tenant_id,
              audience,
              operation,
              idempotency_key,
              request_hash,
              status,
              operation_id,
              expires_at
            )
            VALUES (
              ${DATABASE_IDS.idempotencyA},
              ${DATABASE_IDS.tenantA},
              'client-portal',
              'conversation.take_over',
              'same-request',
              'sha256:same-request',
              'PROCESSING',
              ${DATABASE_IDS.operationA},
              now() + interval '24 hours'
            )
            ON CONFLICT (id) DO NOTHING
          `;
        },
      );

      await expect(
        withTenantTransaction(
          database,
          {
            principalId: DATABASE_IDS.userA,
            tenantId: DATABASE_IDS.tenantA,
          },
          (transaction) => transaction`
            INSERT INTO chai.idempotency_record (
              id,
              tenant_id,
              audience,
              operation,
              idempotency_key,
              request_hash,
              status,
              operation_id,
              expires_at
            )
            VALUES (
              ${DATABASE_IDS.idempotencyB},
              ${DATABASE_IDS.tenantA},
              'client-portal',
              'conversation.take_over',
              'same-request',
              'sha256:same-request',
              'PROCESSING',
              ${DATABASE_IDS.operationA},
              now() + interval '24 hours'
            )
          `,
        ),
      ).rejects.toThrow(/unique/i);
    } finally {
      await database.end();
    }
  });

  it('allows the same operation key in another tenant', async () => {
    const database = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      await expect(
        withTenantTransaction(
          database,
          {
            principalId: DATABASE_IDS.userB,
            tenantId: DATABASE_IDS.tenantB,
          },
          (transaction) => transaction`
            INSERT INTO chai.idempotency_record (
              id,
              tenant_id,
              audience,
              operation,
              idempotency_key,
              request_hash,
              status,
              operation_id,
              expires_at
            )
            VALUES (
              '01890f47-9b3c-7cc2-98e8-12345678910c',
              ${DATABASE_IDS.tenantB},
              'client-portal',
              'conversation.take_over',
              'same-request',
              'sha256:same-request',
              'PROCESSING',
              ${DATABASE_IDS.operationB},
              now() + interval '24 hours'
            )
            ON CONFLICT (id) DO NOTHING
          `,
        ),
      ).resolves.toBeDefined();
    } finally {
      await database.end();
    }
  });
});
