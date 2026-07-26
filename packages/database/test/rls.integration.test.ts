import { beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { createDatabase, withTenantTransaction } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

describe('tenant RLS', () => {
  beforeAll(async () => seedFoundation(inject('adminDatabaseUrl')));

  it('defaults to no visible tenant rows when context is missing', async () => {
    const database = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      const rows = await database<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM chai.membership
      `;

      expect(rows).toEqual([]);
    } finally {
      await database.end();
    }
  });

  it('shows only rows for the transaction tenant context', async () => {
    const database = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      const tenantIds = await withTenantTransaction(
        database,
        {
          principalId: DATABASE_IDS.userA,
          tenantId: DATABASE_IDS.tenantA,
        },
        async (transaction) => {
          const rows = await transaction<{ tenant_id: string }[]>`
            SELECT tenant_id
            FROM chai.membership
            ORDER BY tenant_id
          `;
          return rows.map(({ tenant_id }) => tenant_id);
        },
      );

      expect(tenantIds).toEqual([DATABASE_IDS.tenantA]);
    } finally {
      await database.end();
    }
  });

  it('rejects writes for a different tenant', async () => {
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
            INSERT INTO chai.entitlement (
              id,
              tenant_id,
              capability_key,
              enabled
            )
            VALUES (
              '01890f47-9b3c-7cc2-98e8-12345678910b',
              ${DATABASE_IDS.tenantB},
              'payments',
              true
            )
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await database.end();
    }
  });
});
