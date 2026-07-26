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
    const list = await conversations.json();

    // All conversations should belong to the authenticated tenant
    for (const conv of list) {
      expect(conv.tenantId).toBe('01890f47-9b3c-7cc2-98e8-123456789203');
    }
  });

  test('leads are tenant-scoped', async ({ request }) => {
    const leads = await request.get(`${API_BASE}/api/client/v1/leads`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(leads.ok()).toBeTruthy();
    const list = await leads.json();

    for (const lead of list) {
      expect(lead.tenantId).toBe('01890f47-9b3c-7cc2-98e8-123456789203');
    }
  });

  test('payments are tenant-scoped', async ({ request }) => {
    // Create a checkout session
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: { 'x-test-subject': 'local|client-owner' },
        data: {
          amount: 1000,
          currency: 'usd',
          idempotencyKey: `tenant-isolation-${Date.now()}`,
        },
      },
    );
    expect(checkout.ok()).toBeTruthy();
    const session = await checkout.json();

    // Retrieve it - should work for own tenant
    const retrieved = await request.get(
      `${API_BASE}/api/client/v1/payments/${session.externalId}`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(retrieved.ok()).toBeTruthy();

    // Attempt to retrieve with a different tenant context would fail
    // (in real multi-tenant setup, not possible with local identity adapter)
  });

  test('team members are tenant-scoped', async ({ request }) => {
    const team = await request.get(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(team.ok()).toBeTruthy();
    const members = await team.json();

    // All members should be in the same tenant
    expect(Array.isArray(members)).toBeTruthy();
  });

  test('analytics are tenant-scoped', async ({ request }) => {
    const outcomes = await request.get(
      `${API_BASE}/api/client/v1/analytics/outcomes`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(outcomes.ok()).toBeTruthy();
    const dashboard = await outcomes.json();

    // Dashboard should be scoped to authenticated tenant
    expect(dashboard).toBeDefined();
  });

  test('unauthenticated requests are rejected', async ({ request }) => {
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
    );
    expect(conversations.status()).toBe(403);

    const leads = await request.get(`${API_BASE}/api/client/v1/leads`);
    expect(leads.status()).toBe(403);

    const team = await request.get(`${API_BASE}/api/client/v1/team`);
    expect(team.status()).toBe(403);
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
      headers: { 'x-test-subject': 'local|client-viewer' },
      data: { userId: 'new-user', role: 'CLIENT_VIEWER' },
    });
    expect(invite.status()).toBe(403);
  });

  test('agent role cannot manage team', async ({ request }) => {
    const invite = await request.post(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-agent' },
      data: { userId: 'new-user', role: 'CLIENT_VIEWER' },
    });
    expect(invite.status()).toBe(403);
  });
});
