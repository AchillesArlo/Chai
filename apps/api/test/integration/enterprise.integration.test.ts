import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_CLIENT_OWNER_ID, API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresEnterpriseRepository } from '../../src/modules/enterprise/postgres-enterprise.repository';

describe('API Postgres enterprise repository (Fase 4.2)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('persists SSO, SCIM, a custom role, a role assignment and an audit export across a new instance', async () => {
    const writer = new PostgresEnterpriseRepository(runtime);

    const sso = await writer.upsertSsoConfig(API_TENANT_ID, {
      attributeMapping: { email: 'mail' },
      certificate: '-----BEGIN CERTIFICATE-----abc-----END CERTIFICATE-----',
      enabled: true,
      entityId: 'urn:chai:sp',
      provider: 'saml',
      ssoUrl: 'https://idp.example.com/sso',
      tenantId: API_TENANT_ID,
    });

    const scim = await writer.upsertScimConfig(API_TENANT_ID, {
      baseUrl: 'https://scim.example.com',
      groupSyncEnabled: false,
      tenantId: API_TENANT_ID,
      userSyncEnabled: true,
    });
    expect(scim.lastSyncAt).toBeNull();

    const role = await writer.createRole(API_TENANT_ID, {
      description: 'read-only reliability access',
      name: 'reliability-viewer',
      permissions: ['platform.reliability.read'],
      tenantId: API_TENANT_ID,
    });

    const assignment = await writer.assignRole(
      API_TENANT_ID,
      API_CLIENT_OWNER_ID,
      role.id,
      API_CLIENT_OWNER_ID,
    );

    const exportConfig = await writer.upsertAuditExportConfig(API_TENANT_ID, {
      destinationConfig: { bucket: 'chai-audit-exports' },
      destinationType: 's3',
      enabled: true,
      filterCriteria: { minSeverity: 'P3' },
      tenantId: API_TENANT_ID,
    });
    expect(exportConfig.lastExportAt).toBeNull();

    const history = await writer.createAuditExportHistory(API_TENANT_ID, {
      completedAt: null,
      configId: exportConfig.id,
      errorMessage: null,
      recordsExported: 0,
      startedAt: new Date().toISOString(),
      status: 'running',
      tenantId: API_TENANT_ID,
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresEnterpriseRepository(runtime);

    const fetchedSso = await reader.getSsoConfig(API_TENANT_ID, 'saml');
    expect(fetchedSso?.id).toBe(sso.id);
    expect(fetchedSso?.attributeMapping).toEqual({ email: 'mail' });

    const fetchedScim = await reader.getScimConfig(API_TENANT_ID);
    expect(fetchedScim?.baseUrl).toBe('https://scim.example.com');

    const fetchedRole = await reader.getRole(API_TENANT_ID, role.id);
    expect(fetchedRole?.permissions).toEqual(['platform.reliability.read']);

    const assignments = await reader.listRoleAssignments(API_TENANT_ID, API_CLIENT_OWNER_ID);
    expect(assignments.some((row) => row.id === assignment.id)).toBe(true);

    const histories = await reader.listAuditExportHistory(API_TENANT_ID, exportConfig.id);
    expect(histories.some((row) => row.id === history.id)).toBe(true);

    const completedHistory = await reader.updateAuditExportHistory(
      API_TENANT_ID,
      history.id,
      { completedAt: new Date().toISOString(), recordsExported: 42, status: 'completed' },
    );
    expect(completedHistory.recordsExported).toBe(42);

    // revokeRole exercises the DELETE grant on chai.role_assignment.
    await reader.revokeRole(API_TENANT_ID, API_CLIENT_OWNER_ID, role.id);
    expect(
      (await reader.listRoleAssignments(API_TENANT_ID, API_CLIENT_OWNER_ID)).some(
        (row) => row.id === assignment.id,
      ),
    ).toBe(false);

    // deleteRole exercises the DELETE grant on chai.custom_role.
    await reader.deleteRole(API_TENANT_ID, role.id);
    expect(await reader.getRole(API_TENANT_ID, role.id)).toBeNull();
  });

  it('isolates SSO configs and custom roles by tenant under RLS', async () => {
    const repo = new PostgresEnterpriseRepository(runtime);
    const role = await repo.createRole(API_TENANT_ID, {
      description: null,
      name: 'tenant-only-role',
      permissions: [],
      tenantId: API_TENANT_ID,
    });

    const crossTenantRoles = await repo.listRoles(API_TENANT_B_ID);
    expect(crossTenantRoles.some((row) => row.id === role.id)).toBe(false);
    expect(await repo.getRole(API_TENANT_B_ID, role.id)).toBeNull();

    await repo.upsertSsoConfig(API_TENANT_ID, {
      attributeMapping: {},
      certificate: 'cert',
      enabled: true,
      entityId: 'urn:tenant-a',
      provider: 'oidc',
      ssoUrl: 'https://idp-a.example.com',
      tenantId: API_TENANT_ID,
    });
    expect(await repo.getSsoConfig(API_TENANT_B_ID, 'oidc')).toBeNull();
  });
});
