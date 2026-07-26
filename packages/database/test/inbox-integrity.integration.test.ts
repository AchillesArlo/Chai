import postgres from 'postgres';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { DATABASE_IDS, seedFoundation } from './fixtures';

const INBOX_ID = '01890f47-9b3c-7cc2-98e8-123456789114';
const INVALID_INBOX_ID = '01890f47-9b3c-7cc2-98e8-123456789115';
const INVALID_HASH_INBOX_ID = '01890f47-9b3c-7cc2-98e8-123456789116';
const PAYLOAD_HASH = `sha256:${'a'.repeat(64)}`;

describe('inbox payload integrity', () => {
  beforeAll(async () => seedFoundation(inject('adminDatabaseUrl')));

  afterEach(async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await admin`
        DELETE FROM chai.inbox_event
        WHERE id IN (${INBOX_ID}, ${INVALID_INBOX_ID}, ${INVALID_HASH_INBOX_ID})
      `;
    } finally {
      await admin.end();
    }
  });

  it('stores schema version and a versioned SHA-256 payload hash', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const [record] = await admin<
        { payload_hash: string; schema_version: number }[]
      >`
        INSERT INTO chai.inbox_event (
          id,
          tenant_id,
          provider,
          provider_account_id,
          external_event_id,
          schema_version,
          payload_reference,
          payload_hash
        )
        VALUES (
          ${INBOX_ID},
          ${DATABASE_IDS.tenantA},
          'mock-channel',
          ${DATABASE_IDS.tenantA},
          'integrity-event',
          1,
          'restricted://integrity-event',
          ${PAYLOAD_HASH}
        )
        RETURNING schema_version, payload_hash
      `;

      expect(record).toEqual({ payload_hash: PAYLOAD_HASH, schema_version: 1 });
    } finally {
      await admin.end();
    }
  });

  it('rejects an unversioned payload', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await expect(
        admin`
          INSERT INTO chai.inbox_event (
            id,
            tenant_id,
            provider,
            provider_account_id,
            external_event_id,
            schema_version,
            payload_reference,
            payload_hash
          )
          VALUES (
            ${INVALID_INBOX_ID},
            ${DATABASE_IDS.tenantA},
            'mock-channel',
            ${DATABASE_IDS.tenantA},
            'invalid-integrity-event',
            0,
            'restricted://invalid-integrity-event',
            ${PAYLOAD_HASH}
          )
        `,
      ).rejects.toThrow(/inbox_event_schema_version_positive/i);
    } finally {
      await admin.end();
    }
  });

  it('rejects a malformed payload hash', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      await expect(
        admin`
          INSERT INTO chai.inbox_event (
            id,
            tenant_id,
            provider,
            provider_account_id,
            external_event_id,
            schema_version,
            payload_reference,
            payload_hash
          )
          VALUES (
            ${INVALID_HASH_INBOX_ID},
            ${DATABASE_IDS.tenantA},
            'mock-channel',
            ${DATABASE_IDS.tenantA},
            'invalid-hash-event',
            1,
            'restricted://invalid-hash-event',
            'not-a-versioned-hash'
          )
        `,
      ).rejects.toThrow(/inbox_event_payload_hash_valid/i);
    } finally {
      await admin.end();
    }
  });
});
