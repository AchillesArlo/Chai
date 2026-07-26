import { beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { createDatabase, withTenantTransaction } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

describe('tenant-aware foreign keys', () => {
  beforeAll(async () => seedFoundation(inject('adminDatabaseUrl')));

  it('rejects an operation reference owned by another tenant', async () => {
    const database = createDatabase(inject('runtimeDatabaseUrl'));

    try {
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
              ${DATABASE_IDS.idempotencyCrossTenant},
              ${DATABASE_IDS.tenantA},
              'client-portal',
              'conversation.take_over',
              'tenant-aware-fk',
              'sha256:tenant-aware-fk',
              'PROCESSING',
              ${DATABASE_IDS.operationB},
              now() + interval '24 hours'
            )
          `,
        ),
      ).rejects.toThrow(/foreign key/i);
    } finally {
      await database.end();
    }
  });
});
