import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresWidgetRepository } from '../../src/modules/widget/postgres-widget.repository';

describe('API Postgres widget repository (Fase 5.5)', () => {
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

  it('persists a widget and a public session across a new instance, and honours the delete grant', async () => {
    const writer = new PostgresWidgetRepository(runtime);

    const widget = await writer.createWidget(API_TENANT_ID, {
      allowedOrigins: ['https://example.com'],
      analyticsEnabled: true,
      businessHours: { mon: '09:00-17:00' },
      domain: 'example.com',
      embedCode: null,
      greetingMessage: 'Hi there!',
      language: 'en',
      name: 'Support Widget',
      offlineMessage: 'We are offline',
      position: 'bottom-right',
      status: 'active',
      theme: { primaryColor: '#123456' },
      widgetType: 'chat',
    });

    // createSession mirrors the public widget runtime, which supplies
    // tenantId directly (resolved client-side from the embed script), unlike
    // list/get/update which have no tenant context at all.
    const session = await writer.createSession({
      contactId: null,
      conversationId: null,
      ipAddress: '203.0.113.7',
      landingPage: 'https://example.com/pricing',
      metadata: { locale: 'en-US' },
      referrerUrl: 'https://google.com',
      startedAt: new Date().toISOString(),
      status: 'active',
      tenantId: API_TENANT_ID,
      userAgent: 'vitest',
      visitorId: 'visitor-abc',
      widgetId: widget.id,
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresWidgetRepository(runtime);

    const fetchedWidget = await reader.getWidget(API_TENANT_ID, widget.id);
    expect(fetchedWidget?.theme).toEqual({ primaryColor: '#123456' });

    // listSessions/getSession/updateSession take NO tenantId — they discover
    // the owning tenant through the SECURITY DEFINER lookups (migration
    // 0070), exactly matching the public, unauthenticated widget runtime.
    const fetchedSession = await reader.getSession(session.id);
    expect(fetchedSession?.visitorId).toBe('visitor-abc');

    const sessions = await reader.listSessions(widget.id, 'active');
    expect(sessions.some((row) => row.id === session.id)).toBe(true);

    const ended = await reader.updateSession(session.id, {
      endedAt: new Date().toISOString(),
      status: 'ended',
    });
    expect(ended.status).toBe('ended');
    expect(ended.endedAt).not.toBeNull();

    // deleteWidget exercises the DELETE grant (migration 0070).
    // widget_sessions FKs to widgets with no ON DELETE, so the session row is
    // cleared first (out of band, mirroring the FK-ordering fix used for
    // advanced-analytics / partner-ecosystem).
    await admin`DELETE FROM public.widget_sessions WHERE id = ${session.id}`;
    await writer.deleteWidget(API_TENANT_ID, widget.id);
    expect(await writer.getWidget(API_TENANT_ID, widget.id)).toBeNull();
  });

  it('isolates widgets by tenant under RLS, and getSession(unknown id) returns null', async () => {
    const repo = new PostgresWidgetRepository(runtime);
    const widget = await repo.createWidget(API_TENANT_ID, {
      allowedOrigins: [],
      analyticsEnabled: false,
      businessHours: null,
      domain: 'tenant-only.example.com',
      embedCode: null,
      greetingMessage: null,
      language: 'id',
      name: 'tenant-only-widget',
      offlineMessage: null,
      position: 'top-left',
      status: 'inactive',
      theme: {},
      widgetType: 'faq',
    });

    const crossTenantWidgets = await repo.listWidgets(API_TENANT_B_ID);
    expect(crossTenantWidgets.some((row) => row.id === widget.id)).toBe(false);
    expect(await repo.getWidget(API_TENANT_B_ID, widget.id)).toBeNull();

    expect(await repo.getSession('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await repo.listSessions(widget.id)).toEqual([]);
  });
});
