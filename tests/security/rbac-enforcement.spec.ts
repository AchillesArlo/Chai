import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * Security: RBAC Enforcement
 * Verify all endpoints check permissions correctly.
 *
 * Tests the audience guard, role-based access, and permission enforcement
 * across all client-portal and owner-console API routes.
 */

// ─── Authentication ──────────────────────────────────────────────────

test.describe('authentication enforcement', () => {
  const clientEndpoints = [
    { method: 'GET', url: '/api/client/v1/conversations' },
    { method: 'GET', url: '/api/client/v1/leads' },
    { method: 'GET', url: '/api/client/v1/team' },
    { method: 'GET', url: '/api/client/v1/analytics/outcomes' },
    { method: 'GET', url: '/api/client/v1/session' },
  ];

  for (const { method, url } of clientEndpoints) {
    test(`rejects unauthenticated ${method} ${url}`, async ({ request }) => {
      const response = await request.fetch(`${API_BASE}${url}`, { method });
      expect(response.status()).toBeGreaterThanOrEqual(401);
      expect(response.status()).toBeLessThan(500);
    });
  }

  test('rejects unauthenticated POST to appointments', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      data: { contactId: 'x', idempotencyKey: 'x', resourceId: 'x', startsAt: new Date().toISOString(), endsAt: new Date().toISOString(), title: 'x' },
    });
    expect(response.status()).toBeGreaterThanOrEqual(401);
  });

  test('rejects unauthenticated POST to checkout', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      data: { amount: 100, currency: 'usd', idempotencyKey: 'x' },
    });
    expect(response.status()).toBeGreaterThanOrEqual(401);
  });

  test('rejects unauthenticated POST to actions/evaluate', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/actions/evaluate`, {
      data: { mode: 'AI_ACTIVE', origin: 'ai', tool: 'reply', parameters: {} },
    });
    expect(response.status()).toBeGreaterThanOrEqual(401);
  });
});

// ─── Audience Guard ──────────────────────────────────────────────────

test.describe('audience guard', () => {
  test('owner principal cannot access client routes', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/conversations`, {
      headers: { 'x-test-subject': 'local|owner' },
    });
    expect(response.status()).toBe(403);
  });

  test('client principal cannot access owner routes', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(response.status()).toBe(403);
  });

  test('service principal cannot access owner routes', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: { 'x-test-subject': 'local|owner-service' },
    });
    expect(response.status()).toBe(403);
  });
});

// ─── Status-Based Rejection ──────────────────────────────────────────

test.describe('account status enforcement', () => {
  test('disabled client account is rejected', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/conversations`, {
      headers: { 'x-test-subject': 'local|client-disabled' },
    });
    expect(response.status()).toBe(403);
  });

  test('revoked client membership is rejected', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/conversations`, {
      headers: { 'x-test-subject': 'local|client-revoked' },
    });
    expect(response.status()).toBe(403);
  });

  test('disabled owner account is rejected', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: { 'x-test-subject': 'local|owner-disabled' },
    });
    expect(response.status()).toBe(403);
  });

  test('owner without platform role is rejected', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: { 'x-test-subject': 'local|owner-roleless' },
    });
    expect(response.status()).toBe(403);
  });

  test('owner with MFA required but not enrolled is rejected', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/owner/v1/session`, {
      headers: { 'x-test-subject': 'local|owner-mfa-required' },
    });
    expect(response.status()).toBe(401);
  });
});

// ─── Role-Based Access ───────────────────────────────────────────────

test.describe('role-based access control', () => {
  test('viewer can read team but cannot invite', async ({ request }) => {
    const read = await request.get(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-viewer' },
    });
    expect(read.status()).toBe(200);

    const write = await request.post(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-viewer' },
      data: { userId: 'new-user', role: 'CLIENT_VIEWER' },
    });
    expect(write.status()).toBe(403);
  });

  test('agent can read team but cannot invite', async ({ request }) => {
    const read = await request.get(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-agent' },
    });
    expect(read.status()).toBe(200);

    const write = await request.post(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-agent' },
      data: { userId: 'new-user', role: 'CLIENT_VIEWER' },
    });
    expect(write.status()).toBe(403);
  });

  test('agent can read team but cannot update roles', async ({ request }) => {
    const update = await request.patch(`${API_BASE}/api/client/v1/team/some-id`, {
      headers: { 'x-test-subject': 'local|client-agent' },
      data: { role: 'CLIENT_VIEWER' },
    });
    expect(update.status()).toBe(403);
  });

  test('agent can read team but cannot revoke members', async ({ request }) => {
    const revoke = await request.delete(`${API_BASE}/api/client/v1/team/some-id`, {
      headers: { 'x-test-subject': 'local|client-agent' },
    });
    expect(revoke.status()).toBe(403);
  });

  test('owner can manage team', async ({ request }) => {
    const read = await request.get(`${API_BASE}/api/client/v1/team`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(read.status()).toBe(200);
  });
});

// ─── Action Policy ───────────────────────────────────────────────────

test.describe('action policy enforcement', () => {
  test('AI origin allowed in AI_ACTIVE mode', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/actions/evaluate`, {
      headers: { 'x-test-subject': 'local|client-owner' },
      data: { mode: 'AI_ACTIVE', origin: 'ai', tool: 'reply', parameters: {} },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.kind).toBe('allow');
  });

  test('human origin denied in AI_ACTIVE mode', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/actions/evaluate`, {
      headers: { 'x-test-subject': 'local|client-owner' },
      data: { mode: 'AI_ACTIVE', origin: 'human', tool: 'reply', parameters: {} },
    });
    expect(response.status()).toBe(403);
  });

  test('rejects invalid mode value', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/actions/evaluate`, {
      headers: { 'x-test-subject': 'local|client-owner' },
      data: { mode: 'INVALID_MODE', origin: 'ai', tool: 'reply', parameters: {} },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects invalid origin value', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/actions/evaluate`, {
      headers: { 'x-test-subject': 'local|client-owner' },
      data: { mode: 'AI_ACTIVE', origin: 'system', tool: 'reply', parameters: {} },
    });
    expect(response.status()).toBe(400);
  });
});

// ─── Error Response Safety ───────────────────────────────────────────

test.describe('error response safety', () => {
  test('403 responses do not leak internal details', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/conversations`, {
      headers: { 'x-test-subject': 'local|owner' },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    // Should not contain tenant IDs, internal paths, or stack traces
    expect(serialized).not.toContain('01890f47');
    expect(serialized).not.toContain('at ');
    expect(serialized).not.toContain('node_modules');
  });

  test('401 responses do not leak authentication mechanism', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/client/v1/conversations`);
    expect(response.status()).toBeGreaterThanOrEqual(401);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('x-test-subject');
    expect(serialized).not.toContain('local|');
  });
});
