import postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { createDatabase, withPrincipalTransaction } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

const AUDIT_IDS = {
  crossPrincipal: '01890f47-9b3c-7cc2-98e8-123456789117',
  ownerAction: '01890f47-9b3c-7cc2-98e8-123456789118',
} as const;

describe('platform audit log', () => {
  beforeAll(async () => seedFoundation(inject('adminDatabaseUrl')));

  it('records a tenantless platform event for the trusted principal', async () => {
    const runtime = createDatabase(inject('runtimeDatabaseUrl'));
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await withPrincipalTransaction(
        runtime,
        DATABASE_IDS.userA,
        (transaction) => transaction`
          INSERT INTO chai.platform_audit_log (
            id,
            actor_type,
            actor_id,
            action,
            resource_type,
            risk,
            reason,
            correlation_id
          )
          VALUES (
            ${AUDIT_IDS.ownerAction},
            'USER',
            ${DATABASE_IDS.userA},
            'platform_role.granted',
            'platform_role_assignment',
            'HIGH',
            'Initial owner bootstrap',
            ${AUDIT_IDS.ownerAction}
          )
        `,
      );

      const rows = await admin<{ actor_id: string; action: string }[]>`
        SELECT actor_id, action
        FROM chai.platform_audit_log
        WHERE id = ${AUDIT_IDS.ownerAction}
      `;
      expect(rows).toEqual([
        {
          action: 'platform_role.granted',
          actor_id: DATABASE_IDS.userA,
        },
      ]);
    } finally {
      await admin.end();
      await runtime.end();
    }
  });

  it('rejects a platform event attributed to another principal', async () => {
    const runtime = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      await expect(
        withPrincipalTransaction(
          runtime,
          DATABASE_IDS.userA,
          (transaction) => transaction`
            INSERT INTO chai.platform_audit_log (
              id,
              actor_type,
              actor_id,
              action,
              resource_type,
              risk,
              correlation_id
            )
            VALUES (
              ${AUDIT_IDS.crossPrincipal},
              'USER',
              ${DATABASE_IDS.userB},
              'platform_role.granted',
              'platform_role_assignment',
              'HIGH',
              ${AUDIT_IDS.crossPrincipal}
            )
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await runtime.end();
    }
  });

  it('does not expose platform audit rows to the app runtime', async () => {
    const runtime = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      await expect(
        runtime`
          SELECT id
          FROM chai.platform_audit_log
        `,
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await runtime.end();
    }
  });
});
