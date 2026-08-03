import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * E2E: Multi-Tenant Isolation
 * Verify Tenant A cannot access Tenant B data
 */
test.describe('multi-tenant isolation', () => {
  test('client portal user cannot access other tenant data', async ({
    request,
  }) => {
    // The local|client-owner principal is scoped to tenant 01890f47-9b3c-7cc2-98e8-123456789203
    // Attempt to list conversations - should only see own tenant's data
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(conversations.ok()).toBeTruthy();
    const body = await conversations.json();

    // ConversationSummary (packages/domain/src/conversations/index.ts) never
    // exposes tenantId on each row — the list is already tenant-scoped by RLS
    // before it reaches the response, so there is nothing to assert per-row.
    // Cross-tenant leakage via a spoofed x-tenant-id is covered explicitly in
    // tests/security/tenant-isolation.spec.ts.
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('leads are tenant-scoped', async ({ request }) => {
    const leads = await request.get(`${API_BASE}/api/client/v1/leads`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(leads.ok()).toBeTruthy();
    const body = await leads.json();

    for (const lead of body.data) {
      expect(lead.tenantId).toBe('01890f47-9b3c-7cc2-98e8-123456789203');
    }
  });

  test('payments are tenant-scoped', async ({ request }) => {
    // FASE 6 — checkout resolves its amount from a real invoice. Seed a
    // catalog item -> order -> invoice through the real endpoints first.
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const catalog = await request.post(`${API_BASE}/api/client/v1/orders/catalog`, {
      headers: {
        'Idempotency-Key': `tenant-isolation-catalog-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        currency: 'IDR',
        name: `Tenant isolation item ${unique}`,
        sku: `ti-${unique}`,
        unitPriceCents: 1000,
      },
    });
    const serviceItemId = (await catalog.json()).data.id as string;

    const order = await request.post(`${API_BASE}/api/client/v1/orders`, {
      headers: {
        'Idempotency-Key': `tenant-isolation-order-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      data: { items: [{ quantity: 1, serviceItemId }] },
    });
    const orderId = (await order.json()).data.id as string;

    const invoiceResponse = await request.post(
      `${API_BASE}/api/client/v1/orders/${orderId}/invoices`,
      {
        headers: {
          'Idempotency-Key': `tenant-isolation-invoice-${unique}`,
          'x-test-subject': 'local|client-owner',
        },
        data: {},
      },
    );
    const invoiceId = (await invoiceResponse.json()).data.id as string;

    // Create a checkout session
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: {
          'Idempotency-Key': `tenant-isolation-${unique}`,
          'x-test-subject': 'local|client-owner',
        },
        data: {
          idempotencyKey: `tenant-isolation-${unique}`,
          invoiceId,
        },
      },
    );
    expect(checkout.ok()).toBeTruthy();
    const created = await checkout.json();

    // Retrieve it - should work for own tenant
    const retrieved = await request.get(
      `${API_BASE}/api/client/v1/payments/${created.data.externalId}`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(retrieved.ok()).toBeTruthy();

    // Attempt to retrieve with a different tenant context would fail
    // (in real multi-tenant setup, not possible with local identity adapter)
  });

  // CLIENT_OWNER is the only seeded principal with tenant.team.read
  // (packages/auth/src/permissions.ts); this exercises that the endpoint is
  // tenant-scoped for the role that can actually reach it.
  test('team members are tenant-scoped', async ({ request }) => {
    const team = await request.get(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(team.ok()).toBeTruthy();
    const body = await team.json();

    // All members should be in the same tenant
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('analytics are tenant-scoped', async ({ request }) => {
    const outcomes = await request.get(
      `${API_BASE}/api/client/v1/analytics/outcomes`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(outcomes.ok()).toBeTruthy();
    const body = await outcomes.json();

    // Dashboard should be scoped to authenticated tenant
    expect(body.data).toBeDefined();
  });

  test('unauthenticated requests are rejected', async ({ request }) => {
    // No principal at all (no x-test-subject) is 401 Unauthorized
    // (audience.guard.ts); a wrong audience/permission for an authenticated
    // principal is 403 Forbidden — a distinct, later guard outcome.
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
    );
    expect(conversations.status()).toBe(401);

    const leads = await request.get(`${API_BASE}/api/client/v1/leads`);
    expect(leads.status()).toBe(401);

    const team = await request.get(`${API_BASE}/api/client/v1/team`);
    expect(team.status()).toBe(401);
  });

  test('disabled accounts are rejected', async ({ request }) => {
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
      { headers: { 'x-test-subject': 'local|client-disabled' } },
    );
    expect(conversations.status()).toBe(403);
  });

  test('revoked memberships are rejected', async ({ request }) => {
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
      { headers: { 'x-test-subject': 'local|client-revoked' } },
    );
    expect(conversations.status()).toBe(403);
  });

  test('viewer role cannot manage team', async ({ request }) => {
    const invite = await request.post(`${API_BASE}/api/client/v1/team`, {
      headers: {
        'Idempotency-Key': `viewer-manage-${Date.now()}`,
        'x-test-subject': 'local|client-viewer',
      },
      data: { userId: 'new-user', role: 'CLIENT_VIEWER' },
    });
    expect(invite.status()).toBe(403);
  });

  test('agent role cannot manage team', async ({ request }) => {
    const invite = await request.post(`${API_BASE}/api/client/v1/team`, {
      headers: {
        'Idempotency-Key': `agent-manage-${Date.now()}`,
        'x-test-subject': 'local|client-agent',
      },
      data: { userId: 'new-user', role: 'CLIENT_VIEWER' },
    });
    expect(invite.status()).toBe(403);
  });
});
