import postgres from 'postgres';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { createDatabase } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

const ASSIGNMENT_IDS = {
  disabledAdmin: '01890f47-9b3c-7cc2-98e8-12345678910e',
  ownerA: '01890f47-9b3c-7cc2-98e8-12345678910f',
  ownerB: '01890f47-9b3c-7cc2-98e8-123456789110',
  revokedOwner: '01890f47-9b3c-7cc2-98e8-123456789111',
} as const;

describe('platform role assignment', () => {
  beforeAll(async () => seedFoundation(inject('adminDatabaseUrl')));

  afterEach(async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await admin`TRUNCATE chai.platform_role_assignment`;
    } finally {
      await admin.end();
    }
  });

  it('stores the active platform owner with grant metadata', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const [assignment] = await admin<
        {
          granted_by: string;
          role: string;
          status: string;
          user_id: string;
        }[]
      >`
        INSERT INTO chai.platform_role_assignment (
          id,
          user_id,
          role,
          status,
          granted_by
        )
        VALUES (
          ${ASSIGNMENT_IDS.ownerA},
          ${DATABASE_IDS.userA},
          'PLATFORM_OWNER',
          'ACTIVE',
          ${DATABASE_IDS.userA}
        )
        RETURNING user_id, role, status, granted_by
      `;

      expect(assignment).toEqual({
        granted_by: DATABASE_IDS.userA,
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE',
        user_id: DATABASE_IDS.userA,
      });
    } finally {
      await admin.end();
    }
  });

  it('rejects a second active platform owner', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await admin`
        INSERT INTO chai.platform_role_assignment (
          id,
          user_id,
          role,
          status,
          granted_by
        )
        VALUES (
          ${ASSIGNMENT_IDS.ownerA},
          ${DATABASE_IDS.userA},
          'PLATFORM_OWNER',
          'ACTIVE',
          ${DATABASE_IDS.userA}
        )
      `;

      await expect(
        admin`
          INSERT INTO chai.platform_role_assignment (
            id,
            user_id,
            role,
            status,
            granted_by
          )
          VALUES (
            ${ASSIGNMENT_IDS.ownerB},
            ${DATABASE_IDS.userB},
            'PLATFORM_OWNER',
            'ACTIVE',
            ${DATABASE_IDS.userA}
          )
        `,
      ).rejects.toThrow(/platform_role_assignment_active_owner_unique/i);
    } finally {
      await admin.end();
    }
  });

  it('rejects removing the sole active owner after bootstrap', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await admin`
        INSERT INTO chai.platform_role_assignment (
          id,
          user_id,
          role,
          status,
          granted_by
        )
        VALUES (
          ${ASSIGNMENT_IDS.ownerA},
          ${DATABASE_IDS.userA},
          'PLATFORM_OWNER',
          'ACTIVE',
          ${DATABASE_IDS.userA}
        )
      `;

      await expect(
        admin`
          DELETE FROM chai.platform_role_assignment
          WHERE id = ${ASSIGNMENT_IDS.ownerA}
        `,
      ).rejects.toThrow(/platform must retain one active owner/i);
    } finally {
      await admin.end();
    }
  });

  it('allows an atomic active-owner replacement', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await admin`
        INSERT INTO chai.platform_role_assignment (
          id,
          user_id,
          role,
          status,
          granted_by
        )
        VALUES (
          ${ASSIGNMENT_IDS.ownerA},
          ${DATABASE_IDS.userA},
          'PLATFORM_OWNER',
          'ACTIVE',
          ${DATABASE_IDS.userA}
        )
      `;

      await admin.begin(async (transaction) => {
        await transaction`
          UPDATE chai.platform_role_assignment
          SET status = 'REVOKED', revoked_at = now()
          WHERE id = ${ASSIGNMENT_IDS.ownerA}
        `;
        await transaction`
          INSERT INTO chai.platform_role_assignment (
            id,
            user_id,
            role,
            status,
            granted_by
          )
          VALUES (
            ${ASSIGNMENT_IDS.ownerB},
            ${DATABASE_IDS.userB},
            'PLATFORM_OWNER',
            'ACTIVE',
            ${DATABASE_IDS.userA}
          )
        `;
      });

      const activeOwners = await admin<{ user_id: string }[]>`
        SELECT user_id
        FROM chai.platform_role_assignment
        WHERE role = 'PLATFORM_OWNER' AND status = 'ACTIVE'
      `;
      expect(activeOwners).toEqual([{ user_id: DATABASE_IDS.userB }]);
    } finally {
      await admin.end();
    }
  });

  it('rejects active internal roles that are disabled during Stage 1', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await expect(
        admin`
          INSERT INTO chai.platform_role_assignment (
            id,
            user_id,
            role,
            status,
            granted_by
          )
          VALUES (
            ${ASSIGNMENT_IDS.disabledAdmin},
            ${DATABASE_IDS.userB},
            'PLATFORM_ADMIN',
            'ACTIVE',
            ${DATABASE_IDS.userA}
          )
        `,
      ).rejects.toThrow(/platform_role_assignment_stage_1_active_role/i);
    } finally {
      await admin.end();
    }
  });

  it('preserves revoked and disabled assignment history', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const rows = await admin<{ role: string; status: string }[]>`
        INSERT INTO chai.platform_role_assignment (
          id,
          user_id,
          role,
          status,
          granted_by,
          revoked_at
        )
        VALUES
          (
            ${ASSIGNMENT_IDS.revokedOwner},
            ${DATABASE_IDS.userA},
            'PLATFORM_OWNER',
            'REVOKED',
            ${DATABASE_IDS.userA},
            now()
          ),
          (
            ${ASSIGNMENT_IDS.disabledAdmin},
            ${DATABASE_IDS.userB},
            'PLATFORM_ADMIN',
            'DISABLED',
            ${DATABASE_IDS.userA},
            now()
          )
        RETURNING role, status
      `;

      expect(rows).toEqual([
        { role: 'PLATFORM_OWNER', status: 'REVOKED' },
        { role: 'PLATFORM_ADMIN', status: 'DISABLED' },
      ]);
    } finally {
      await admin.end();
    }
  });

  it('exposes only the current principal assignment to the app runtime', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });
    const runtime = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      await admin`
        INSERT INTO chai.platform_role_assignment (
          id,
          user_id,
          role,
          status,
          granted_by
        )
        VALUES (
          ${ASSIGNMENT_IDS.ownerA},
          ${DATABASE_IDS.userA},
          'PLATFORM_OWNER',
          'ACTIVE',
          ${DATABASE_IDS.userA}
        )
      `;

      const withoutContext = await runtime<{ user_id: string }[]>`
        SELECT user_id
        FROM chai.platform_role_assignment
      `;
      const withContext = await runtime.begin(async (transaction) => {
        await transaction`
          SELECT set_config('app.principal_id', ${DATABASE_IDS.userA}, true)
        `;
        return transaction<{ user_id: string }[]>`
          SELECT user_id
          FROM chai.platform_role_assignment
        `;
      });

      expect(withoutContext).toEqual([]);
      expect(withContext).toEqual([{ user_id: DATABASE_IDS.userA }]);
      await expect(
        runtime`
          DELETE FROM chai.platform_role_assignment
          WHERE id = ${ASSIGNMENT_IDS.ownerA}
        `,
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await runtime.end();
      await admin.end();
    }
  });
});
