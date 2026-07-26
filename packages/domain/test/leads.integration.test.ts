import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  bookAppointment,
  cancelAppointment,
  listLeads,
  qualifyLead,
} from '../src/leads';
import {
  DOMAIN_IDS,
  LEAD_ID_A,
  LEAD_ID_B,
  resetConversationTables,
  seedContact,
  seedFoundation,
  seedLead,
} from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const tenantAContext = { principalId: PRINCIPAL_A, tenantId: TENANT_A };

const CONTACT_ID_A = '01890f47-9b3c-7cc2-98e8-1234567893a1';

describe('leads and appointments — qualification, idempotency, slot race', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('runtimeDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetConversationTables(adminDatabaseUrl);
  });

  it('qualifies a NEW lead and records a normalized score', async () => {
    await seedContact(adminDatabaseUrl, 'lead-customer');
    await seedLead(adminDatabaseUrl, LEAD_ID_A, CONTACT_ID_A);

    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const qualified = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        qualifyLead(tx, LEAD_ID_A, 150),
      );
      expect(qualified?.stage).toBe('QUALIFIED');
      expect(qualified?.score).toBe(100);

      const leads = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        listLeads(tx),
      );
      expect(leads.find((lead) => lead.id === LEAD_ID_A)?.stage).toBe('QUALIFIED');
    } finally {
      await runtime.end();
    }
  });

  it('returns null when qualifying a lead that belongs to another tenant', async () => {
    await seedContact(adminDatabaseUrl, 'lead-cross');
    await seedLead(adminDatabaseUrl, LEAD_ID_B, CONTACT_ID_A, DOMAIN_IDS.tenantB);

    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const result = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        qualifyLead(tx, LEAD_ID_B, 80),
      );
      expect(result).toBeNull();
    } finally {
      await runtime.end();
    }
  });

  it('books an appointment and collapses a duplicate idempotency key', async () => {
    await seedContact(adminDatabaseUrl, 'booking-customer');
    const runtime = createDatabase(runtimeDatabaseUrl);
    const startsAt = new Date(Date.now() + 86_400_000);
    const endsAt = new Date(startsAt.getTime() + 3_600_000);

    try {
      const first = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        bookAppointment(tx, {
          contactId: CONTACT_ID_A,
          endsAt,
          idempotencyKey: 'book-1',
          resourceId: 'chair-1',
          startsAt,
          tenantId: TENANT_A,
          title: 'Pemeriksaan',
        }),
      );
      expect(first.created).toBe(true);
      expect(first.overlapConflict).toBe(false);

      const replay = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        bookAppointment(tx, {
          contactId: CONTACT_ID_A,
          endsAt,
          idempotencyKey: 'book-1',
          resourceId: 'chair-1',
          startsAt,
          tenantId: TENANT_A,
          title: 'Pemeriksaan',
        }),
      );
      expect(replay.created).toBe(false);
      expect(replay.appointmentId).toBe(first.appointmentId);
    } finally {
      await runtime.end();
    }
  });

  it('rejects an overlapping booking on the same resource', async () => {
    await seedContact(adminDatabaseUrl, 'slot-race');
    const runtime = createDatabase(runtimeDatabaseUrl);
    const base = new Date(Date.now() + 2 * 86_400_000);

    try {
      await withTenantTransaction(runtime, tenantAContext, (tx) =>
        bookAppointment(tx, {
          contactId: CONTACT_ID_A,
          endsAt: new Date(base.getTime() + 3_600_000),
          idempotencyKey: 'slot-a',
          resourceId: 'chair-2',
          startsAt: base,
          tenantId: TENANT_A,
          title: 'A',
        }),
      );
      const overlap = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        bookAppointment(tx, {
          contactId: CONTACT_ID_A,
          endsAt: new Date(base.getTime() + 3_600_000),
          idempotencyKey: 'slot-b',
          resourceId: 'chair-2',
          startsAt: new Date(base.getTime() + 1_800_000),
          tenantId: TENANT_A,
          title: 'B',
        }),
      );
      expect(overlap.created).toBe(false);
      expect(overlap.overlapConflict).toBe(true);
    } finally {
      await runtime.end();
    }
  });

  it('cancels a confirmed appointment', async () => {
    await seedContact(adminDatabaseUrl, 'cancel-customer');
    const runtime = createDatabase(runtimeDatabaseUrl);
    const startsAt = new Date(Date.now() + 3 * 86_400_000);

    try {
      const booked = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        bookAppointment(tx, {
          contactId: CONTACT_ID_A,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
          idempotencyKey: 'cancel-1',
          resourceId: 'chair-3',
          startsAt,
          tenantId: TENANT_A,
          title: 'Akan dibatalkan',
        }),
      );
      const cancelled = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        cancelAppointment(tx, booked.appointmentId),
      );
      expect(cancelled?.status).toBe('CANCELLED');

      // Double-cancel is idempotent (already terminal → null).
      const repeat = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        cancelAppointment(tx, booked.appointmentId),
      );
      expect(repeat).toBeNull();
    } finally {
      await runtime.end();
    }
  });
});
