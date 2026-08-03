import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createProofOfDelivery,
  getProofOfDelivery,
  recordProofAccess,
} from '../src/advanced-logistics/proof-of-delivery';
import { DOMAIN_IDS, seedFoundation } from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const TENANT_B = DOMAIN_IDS.tenantB;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const contextA = { principalId: PRINCIPAL_A, tenantId: TENANT_A };
const contextB = { principalId: PRINCIPAL_A, tenantId: TENANT_B };

const SHIPMENT_A = '01890f47-9b3c-7cc2-98e8-1234567894a1';

async function seedShipment(
  adminDatabaseUrl: string,
  id: string,
  tenantId: string,
): Promise<void> {
  const postgres = (await import('postgres')).default;
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`
      INSERT INTO chai.shipment (id, tenant_id, carrier, tracking_number)
      VALUES (${id}::uuid, ${tenantId}::uuid, 'mock-carrier', ${`TRACK-${id.slice(0, 8)}`})
      ON CONFLICT (id) DO NOTHING
    `;
  } finally {
    await admin.end();
  }
}

async function resetPodTables(adminDatabaseUrl: string): Promise<void> {
  const postgres = (await import('postgres')).default;
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`DELETE FROM chai.proof_of_delivery`;
    await admin`DELETE FROM chai.audit_log WHERE action = 'proof_of_delivery.accessed'`;
    await admin`DELETE FROM chai.shipment`;
  } finally {
    await admin.end();
  }
}

async function countAccessAudits(
  adminDatabaseUrl: string,
  tenantId: string,
): Promise<number> {
  const postgres = (await import('postgres')).default;
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await admin<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM chai.audit_log
      WHERE tenant_id = ${tenantId}::uuid AND action = 'proof_of_delivery.accessed'
    `;
    return rows[0]?.count ?? 0;
  } finally {
    await admin.end();
  }
}

describe('proof_of_delivery — persistence, RLS isolation, and access audit (REQ-17-038)', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('runtimeDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  beforeEach(async () => {
    await resetPodTables(adminDatabaseUrl);
    await seedShipment(adminDatabaseUrl, SHIPMENT_A, TENANT_A);
  });

  afterEach(async () => {
    await resetPodTables(adminDatabaseUrl);
  });

  it('round-trips a captured PoD within its tenant', async () => {
    const db = createDatabase(runtimeDatabaseUrl);
    try {
      const created = await withTenantTransaction(db, contextA, (tx) =>
        createProofOfDelivery(tx, {
          tenantId: TENANT_A,
          shipmentId: SHIPMENT_A,
          artifactRef: 'obj://pod/a.png',
          recipientName: 'John Doe',
          signatureRef: 'obj://sig/a.png',
          deliveredAt: new Date('2026-07-31T10:00:00.000Z'),
          capturedBy: 'courier-1',
        }),
      );
      expect(created.recipientName).toBe('John Doe');

      const fetched = await withTenantTransaction(db, contextA, (tx) =>
        getProofOfDelivery(tx, TENANT_A, SHIPMENT_A),
      );
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.signatureRef).toBe('obj://sig/a.png');
    } finally {
      await db.end();
    }
  });

  it('does not leak a PoD across tenants (RLS)', async () => {
    const db = createDatabase(runtimeDatabaseUrl);
    try {
      await withTenantTransaction(db, contextA, (tx) =>
        createProofOfDelivery(tx, {
          tenantId: TENANT_A,
          shipmentId: SHIPMENT_A,
          artifactRef: 'obj://pod/a.png',
          recipientName: 'John Doe',
          deliveredAt: new Date('2026-07-31T10:00:00.000Z'),
        }),
      );

      // Tenant B asks for tenant A's shipment id: RLS scopes it to tenant B, so
      // the row is invisible and the lookup fails closed.
      const leaked = await withTenantTransaction(db, contextB, (tx) =>
        getProofOfDelivery(tx, TENANT_A, SHIPMENT_A),
      );
      expect(leaked).toBeNull();
    } finally {
      await db.end();
    }
  });

  it('records every PoD access to the audit log', async () => {
    const db = createDatabase(runtimeDatabaseUrl);
    try {
      const created = await withTenantTransaction(db, contextA, (tx) =>
        createProofOfDelivery(tx, {
          tenantId: TENANT_A,
          shipmentId: SHIPMENT_A,
          artifactRef: 'obj://pod/a.png',
          deliveredAt: new Date('2026-07-31T10:00:00.000Z'),
        }),
      );

      expect(await countAccessAudits(adminDatabaseUrl, TENANT_A)).toBe(0);

      await withTenantTransaction(db, contextA, (tx) =>
        recordProofAccess(tx, {
          tenantId: TENANT_A,
          actorId: PRINCIPAL_A,
          podId: created.id,
          shipmentId: SHIPMENT_A,
          outcome: 'GRANTED',
        }),
      );

      expect(await countAccessAudits(adminDatabaseUrl, TENANT_A)).toBe(1);
    } finally {
      await db.end();
    }
  });
});
