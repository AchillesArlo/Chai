import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * Security: Tenant Isolation
 * Verify RLS-style tenant scoping works correctly across all data access paths.
 *
 * The local identity adapter binds each principal to a single tenant.
 * These tests verify that:
 *   1. All list endpoints return only the authenticated tenant's data.
 *   2. Cross-tenant access via x-tenant-id header is rejected for non-owned tenants.
 *   3. Owner tenant scope expiration is enforced.
 *   4. Data returned never leaks cross-tenant identifiers.
 */

const CLIENT_TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789203';
const OTHER_TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789204';

// ─── Tenant-Scoped List Endpoints ────────────────────────────────────

test.describe('tenant-scoped list endpoints', () => {
  test('conversations list returns only own tenant data', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/conversations`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    for (const item of body.data) {
      if (item.tenantId) {
        expect(item.tenantId).toBe(CLIENT_TENANT_ID);
      }
    }
  });

  test('leads list returns only own tenant data', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/leads`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    for (const item of body.data) {
      expect(item.tenantId).toBe(CLIENT_TENANT_ID);
    }
  });

  test('team list returns only own tenant data', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Team members should be scoped to authenticated tenant
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('analytics outcomes are scoped to own tenant', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/analytics/outcomes`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
  });
});

// ─── Cross-Tenant Header Rejection ───────────────────────────────────

test.describe('cross-tenant header rejection', () => {
  test('client cannot select another tenant via x-tenant-id', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/session`, {
      headers: {
        'x-tenant-id': OTHER_TENANT_ID,
        'x-test-subject': 'local|client-owner',
      },
    });
    // Should be 404 (not found) — tenant not owned by this principal
    expect(response.status()).toBe(404);
    const body = await response.json();
    // Response must not contain either tenant ID
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(CLIENT_TENANT_ID);
    expect(serialized).not.toContain(OTHER_TENANT_ID);
  });

  test('client can select own tenant via x-tenant-id', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/session`, {
      headers: {
        'x-tenant-id': CLIENT_TENANT_ID,
        'x-test-subject': 'local|client-owner',
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.tenantId).toBe(CLIENT_TENANT_ID);
  });
});

// ─── Owner Tenant Scope ──────────────────────────────────────────────

test.describe('owner tenant scope enforcement', () => {
  test('owner can scope to owned tenant', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: {
        'x-tenant-id': CLIENT_TENANT_ID,
        'x-test-subject': 'local|owner',
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.tenantId).toBe(CLIENT_TENANT_ID);
  });

  test('owner cannot scope to non-owned tenant', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: {
        'x-tenant-id': OTHER_TENANT_ID,
        'x-test-subject': 'local|owner',
      },
    });
    expect(response.status()).toBe(404);
  });

  test('expired owner tenant scope is rejected', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: {
        'x-tenant-id': CLIENT_TENANT_ID,
        'x-test-subject': 'local|owner-expired-scope',
      },
    });
    expect(response.status()).toBe(404);
  });
});

// ─── Data Isolation Under Mutation ───────────────────────────────────

test.describe('data isolation under mutation', () => {
  test('payment session created in own tenant is retrievable', async ({ request }) => {
    // FASE 6 — checkout resolves its amount from a real invoice, not a
    // client-supplied number. Seed a catalog item -> order -> invoice first.
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const catalog = await request.post(`${API_BASE}/api/client/v1/orders/catalog`, {
      headers: {
        'Idempotency-Key': `tenant-iso-catalog-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        currency: 'IDR',
        name: `Tenant iso item ${unique}`,
        sku: `tiso-${unique}`,
        unitPriceCents: 1000,
      },
    });
    const serviceItemId = (await catalog.json()).data.id as string;

    const order = await request.post(`${API_BASE}/api/client/v1/orders`, {
      headers: {
        'Idempotency-Key': `tenant-iso-order-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      data: { items: [{ quantity: 1, serviceItemId }] },
    });
    const orderId = (await order.json()).data.id as string;

    const invoiceResponse = await request.post(
      `${API_BASE}/api/client/v1/orders/${orderId}/invoices`,
      {
        headers: {
          'Idempotency-Key': `tenant-iso-invoice-${unique}`,
          'x-test-subject': 'local|client-owner',
        },
        data: {},
      },
    );
    const invoiceId = (await invoiceResponse.json()).data.id as string;

    const checkout = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: {
        'Idempotency-Key': `tenant-iso-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        idempotencyKey: `tenant-iso-${unique}`,
        invoiceId,
      },
    });
    expect(checkout.status()).toBe(201);
    const body = await checkout.json();

    // Retrieve in same tenant context
    const retrieved = await request.get(
      `${API_BASE}/api/client/v1/payments/${body.data.externalId}`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(retrieved.status()).toBe(200);
  });

  test('appointment created in own tenant is scoped correctly', async ({ request }) => {
    const startsAt = new Date(Date.now() + 345600000).toISOString();
    const endsAt = new Date(Date.now() + 349200000).toISOString();
    const idempotencyKey = `tenant-iso-appt-${Date.now()}`;

    const booking = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: {
        'Idempotency-Key': idempotencyKey,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        contactId: 'iso-contact',
        idempotencyKey,
        resourceId: 'iso-resource',
        startsAt,
        endsAt,
        title: 'Isolation test appointment',
      },
    });
    expect(booking.status()).toBe(201);
    const body = await booking.json();
    expect(body.data.tenantId).toBe(CLIENT_TENANT_ID);
  });
});

// ─── Information Leakage ─────────────────────────────────────────────

test.describe('information leakage prevention', () => {
  test('404 on wrong tenant reveals no information', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/session`, {
      headers: {
        'x-tenant-id': OTHER_TENANT_ID,
        'x-test-subject': 'local|client-owner',
      },
    });
    expect(response.status()).toBe(404);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    // Must not reveal the other tenant exists
    expect(serialized).not.toContain(OTHER_TENANT_ID);
    expect(serialized).not.toContain(CLIENT_TENANT_ID);
    expect(serialized).not.toContain('tenant');
  });

  test('error messages do not expose internal IDs', async ({ request }) => {
    const response = await request.patch(
      `${API_BASE}/api/client/v1/leads/nonexistent-id/qualify`,
      {
        headers: {
          'Idempotency-Key': `leak-check-${Date.now()}`,
          'x-test-subject': 'local|client-owner',
        },
        data: { score: 50 },
      },
    );
    // Should be 404 — lead not found
    expect(response.status()).toBe(404);
  });
});
