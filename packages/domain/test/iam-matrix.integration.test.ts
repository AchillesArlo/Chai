import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  acceptInvitation,
  createMembership,
  listMemberships,
  revokeMembership,
  updateMembershipRole,
  type Membership,
} from '../src/iam/memberships';
import {
  DOMAIN_IDS,
  resetIamTables,
  seedFoundation,
  seedIamRoster,
} from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const PRINCIPAL_A = DOMAIN_IDS.userA;

const tenantAContext = { principalId: PRINCIPAL_A, tenantId: TENANT_A };

describe('IAM memberships — tenant isolation matrix', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('runtimeDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
    await seedIamRoster(adminDatabaseUrl);
  });

  afterEach(async () => {
    // ponytail: keep the seeded roster stable across cases; per-test mutations
    // are reverted inside their own tenant transactions where it matters.
    await resetIamTables(adminDatabaseUrl);
    await seedIamRoster(adminDatabaseUrl);
  });

  it('lists only memberships of the current tenant', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const memberships = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        listMemberships(tx),
      );

      const tenantIds = new Set(memberships.map((m) => m.tenantId));
      expect(tenantIds).toEqual(new Set([TENANT_A]));
      expect(memberships.length).toBeGreaterThanOrEqual(2);
      expect(memberships.map((m) => m.id).sort()).toContain(DOMAIN_IDS.membershipA);
      expect(memberships.map((m) => m.id)).not.toContain(DOMAIN_IDS.membershipC);
    } finally {
      await runtime.end();
    }
  });

  it('cannot read another tenant membership by id', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const foreign = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        listMemberships(tx),
      );
      // Tenant B's membership must never appear in tenant A's view.
      expect(foreign.find((m) => m.id === DOMAIN_IDS.membershipC)).toBeUndefined();
    } finally {
      await runtime.end();
    }
  });

  it('creates a membership pinned to the current tenant', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const created = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        createMembership(tx, {
          role: 'CLIENT_VIEWER',
          userId: DOMAIN_IDS.userC,
        }),
      );

      expect(created.tenantId).toBe(TENANT_A);
      expect(created.role).toBe('CLIENT_VIEWER');
      expect(created.status).toBe('INVITED');

      const memberships = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        listMemberships(tx),
      );
      expect(memberships.map((m) => m.userId)).toContain(DOMAIN_IDS.userC);
    } finally {
      await runtime.end();
    }
  });

  it('updates a role without leaking across tenants', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const updated = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        updateMembershipRole(tx, DOMAIN_IDS.membershipB, 'CLIENT_MANAGER'),
      );
      expect(updated?.role).toBe('CLIENT_MANAGER');

      // Tenant A cannot touch tenant B's membership: the row is invisible, so the
      // update affects zero rows and returns null.
      const cross = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        updateMembershipRole(tx, DOMAIN_IDS.membershipC, 'CLIENT_ADMIN'),
      );
      expect(cross).toBeNull();
    } finally {
      await runtime.end();
    }
  });

  it('revokes a membership in the current tenant only', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const revoked = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        revokeMembership(tx, DOMAIN_IDS.membershipB),
      );
      expect(revoked?.status).toBe('REVOKED');

      const cross = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        revokeMembership(tx, DOMAIN_IDS.membershipC),
      );
      expect(cross).toBeNull();
    } finally {
      await runtime.end();
    }
  });

  it('activates an invited membership by accepting the invitation', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const accepted = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        acceptInvitation(tx, DOMAIN_IDS.membershipB),
      );
      expect(accepted?.status).toBe('ACTIVE');
      expect(accepted?.role).toBe('CLIENT_AGENT');
    } finally {
      await runtime.end();
    }
  });

  it('normalizes every membership row through a stable shape', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const memberships: Membership[] = await withTenantTransaction(
        runtime,
        tenantAContext,
        (tx) => listMemberships(tx),
      );

      for (const membership of memberships) {
        expect(membership).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            role: expect.any(String),
            status: expect.any(String),
            tenantId: TENANT_A,
            userId: expect.any(String),
          }),
        );
      }
    } finally {
      await runtime.end();
    }
  });
});
