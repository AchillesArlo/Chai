import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_CLIENT_OWNER_ID, API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresImpersonationRepository } from '../../src/modules/impersonation/postgres-impersonation.repository';

describe('API Postgres impersonation repository (Fase 5.4)', () => {
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

  it('persists a session and its audit log across a new instance', async () => {
    const writer = new PostgresImpersonationRepository(runtime);

    const session = await writer.createSession({
      approvedAt: null,
      approvedBy: null,
      impersonatedUserId: API_CLIENT_OWNER_ID,
      impersonatorId: API_CLIENT_OWNER_ID,
      ipAddress: '127.0.0.1',
      maxDurationMinutes: 60,
      reason: 'customer support ticket #123',
      requiresApproval: true,
      startedAt: new Date().toISOString(),
      status: 'active',
      tenantId: API_TENANT_ID,
      userAgent: 'vitest',
    });

    const log = await writer.createAuditLog(API_TENANT_ID, {
      action: 'view_profile',
      details: { fields: ['name', 'email'] },
      impersonationSessionId: session.id,
      resourceId: API_CLIENT_OWNER_ID,
      resourceType: 'user',
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresImpersonationRepository(runtime);

    const fetched = await reader.getSession(API_TENANT_ID, session.id);
    expect(fetched?.reason).toBe('customer support ticket #123');

    const ended = await reader.updateSession(API_TENANT_ID, session.id, {
      endedAt: new Date().toISOString(),
      status: 'ended',
    });
    expect(ended.status).toBe('ended');
    expect(ended.endedAt).not.toBeNull();

    const logs = await reader.listAuditLogs(API_TENANT_ID, session.id);
    expect(logs.some((row) => row.id === log.id)).toBe(true);
    expect(logs.find((row) => row.id === log.id)?.details).toEqual({
      fields: ['name', 'email'],
    });

    const sessions = await reader.listSessions(API_TENANT_ID, 'ended');
    expect(sessions.some((row) => row.id === session.id)).toBe(true);
  });

  it('isolates sessions and audit logs by tenant under RLS', async () => {
    const repo = new PostgresImpersonationRepository(runtime);
    const session = await repo.createSession({
      approvedAt: null,
      approvedBy: null,
      impersonatedUserId: API_CLIENT_OWNER_ID,
      impersonatorId: API_CLIENT_OWNER_ID,
      ipAddress: null,
      maxDurationMinutes: 30,
      reason: 'tenant-only session',
      requiresApproval: false,
      startedAt: new Date().toISOString(),
      status: 'active',
      tenantId: API_TENANT_ID,
      userAgent: null,
    });

    const crossTenantSessions = await repo.listSessions(API_TENANT_B_ID);
    expect(crossTenantSessions.some((row) => row.id === session.id)).toBe(false);
    expect(await repo.getSession(API_TENANT_B_ID, session.id)).toBeNull();

    const log = await repo.createAuditLog(API_TENANT_ID, {
      action: 'view_profile',
      details: {},
      impersonationSessionId: session.id,
      resourceId: null,
      resourceType: null,
    });
    const crossTenantLogs = await repo.listAuditLogs(API_TENANT_B_ID, session.id);
    expect(crossTenantLogs.some((row) => row.id === log.id)).toBe(false);
  });
});
