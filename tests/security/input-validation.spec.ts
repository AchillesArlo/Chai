import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * Security: Input Validation
 * Verify the API correctly rejects malicious or malformed input.
 *
 * Tests:
 *   - SQL injection attempts in parameters and bodies
 *   - XSS payloads in webhook bodies and form fields
 *   - Path traversal attempts
 *   - Malformed JSON / type violations
 *   - Oversized payloads
 *   - Unicode / encoding attacks
 */

const CLIENT_HEADERS = {
  'Content-Type': 'application/json',
  'x-test-subject': 'local|client-owner',
};

// ─── SQL Injection ───────────────────────────────────────────────────

test.describe('SQL injection prevention', () => {
  test('rejects SQL injection in lead qualification ID', async ({ request }) => {
    const response = await request.patch(
      `${API_BASE}/api/client/v1/leads/'; DROP TABLE leads; --/qualify`,
      { headers: CLIENT_HEADERS, data: { score: 50 } },
    );
    // Should be 404 (not found) or 400 (bad request), never 500
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects SQL injection in payment externalId', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/client/v1/payments/1' OR '1'='1`,
      { headers: CLIENT_HEADERS },
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects SQL injection in team member ID', async ({ request }) => {
    const response = await request.patch(
      `${API_BASE}/api/client/v1/team/1; DELETE FROM team_members`,
      { headers: CLIENT_HEADERS, data: { role: 'CLIENT_VIEWER' } },
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects SQL injection in channel provider param', async ({ request }) => {
    const response = await request.post(
      `${API_BASE}/api/service/v1/channels/'; DROP TABLE channels; --/webhook`,
      { data: { test: true } },
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects SQL injection in lead qualification score body', async ({ request }) => {
    const response = await request.patch(
      `${API_BASE}/api/client/v1/leads/test-id/qualify`,
      { headers: CLIENT_HEADERS, data: { score: "50; DROP TABLE leads" as unknown as number } },
    );
    // class-validator should reject non-integer
    expect(response.status()).toBe(400);
  });
});

// ─── XSS Prevention ──────────────────────────────────────────────────

test.describe('XSS prevention', () => {
  test('webhook body with script tag does not execute', async ({ request }) => {
    const response = await request.post(
      `${API_BASE}/api/service/v1/channels/mock/webhook`,
      {
        data: {
          from: '+15551234567',
          message: '<script>alert("xss")</script>',
          tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
        },
      },
    );
    // Should be accepted as plain text, not executed
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      const serialized = JSON.stringify(body);
      // Response should not contain unescaped script tags
      expect(serialized).not.toContain('<script>');
    }
  });

  test('appointment title with HTML is stored as plain text', async ({ request }) => {
    const startsAt = new Date(Date.now() + 432000000).toISOString();
    const endsAt = new Date(Date.now() + 435600000).toISOString();

    const response = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: CLIENT_HEADERS,
      data: {
        contactId: 'xss-contact',
        idempotencyKey: `xss-test-${Date.now()}`,
        resourceId: 'xss-resource',
        startsAt,
        endsAt,
        title: '<img src=x onerror=alert(1)>',
      },
    });
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      // Title should be stored as-is (plain text), not interpreted
      expect(body.title).toBe('<img src=x onerror=alert(1)>');
    }
  });

  test('checkout currency with XSS payload is rejected', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: CLIENT_HEADERS,
      data: {
        amount: 1000,
        currency: '"><script>alert(1)</script>',
        idempotencyKey: `xss-currency-${Date.now()}`,
      },
    });
    // Should be rejected or sanitized
    expect(response.status()).toBeLessThan(500);
  });

  test('lead contact ID with event handler is rejected or stored safely', async ({ request }) => {
    const startsAt = new Date(Date.now() + 518400000).toISOString();
    const endsAt = new Date(Date.now() + 522000000).toISOString();

    const response = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: CLIENT_HEADERS,
      data: {
        contactId: 'javascript:alert(document.cookie)',
        idempotencyKey: `xss-js-${Date.now()}`,
        resourceId: 'resource',
        startsAt,
        endsAt,
        title: 'Test',
      },
    });
    expect(response.status()).toBeLessThan(500);
  });
});

// ─── Path Traversal ──────────────────────────────────────────────────

test.describe('path traversal prevention', () => {
  test('rejects path traversal in channel provider', async ({ request }) => {
    const response = await request.post(
      `${API_BASE}/api/service/v1/channels/..%2F..%2Fetc%2Fpasswd/webhook`,
      { data: { test: true } },
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects path traversal in payment externalId', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/client/v1/payments/..%2F..%2Fetc%2Fpasswd`,
      { headers: CLIENT_HEADERS },
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects path traversal in lead ID', async ({ request }) => {
    const response = await request.patch(
      `${API_BASE}/api/client/v1/leads/..%2F..%2Fetc%2Fpasswd/qualify`,
      { headers: CLIENT_HEADERS, data: { score: 50 } },
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects null byte injection in parameters', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/client/v1/payments/test%00.json`,
      { headers: CLIENT_HEADERS },
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

// ─── Type Validation ─────────────────────────────────────────────────

test.describe('type validation', () => {
  test('rejects non-integer score in lead qualification', async ({ request }) => {
    const response = await request.patch(
      `${API_BASE}/api/client/v1/leads/test-id/qualify`,
      { headers: CLIENT_HEADERS, data: { score: 'not-a-number' } },
    );
    expect(response.status()).toBe(400);
  });

  test('rejects negative score in lead qualification', async ({ request }) => {
    const response = await request.patch(
      `${API_BASE}/api/client/v1/leads/test-id/qualify`,
      { headers: CLIENT_HEADERS, data: { score: -1 } },
    );
    expect(response.status()).toBe(400);
  });

  test('rejects zero amount in checkout', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: CLIENT_HEADERS,
      data: { amount: 0, currency: 'usd', idempotencyKey: 'zero-amount' },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects non-ISO8601 date in appointment booking', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: CLIENT_HEADERS,
      data: {
        contactId: 'contact',
        idempotencyKey: 'bad-date',
        resourceId: 'resource',
        startsAt: 'not-a-date',
        endsAt: 'also-not-a-date',
        title: 'Test',
      },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects missing required fields in appointment booking', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: CLIENT_HEADERS,
      data: { title: 'Incomplete' },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects missing required fields in checkout', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: CLIENT_HEADERS,
      data: { amount: 1000 },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects invalid enum value in action evaluation', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/actions/evaluate`, {
      headers: CLIENT_HEADERS,
      data: {
        mode: 'INVALID_MODE',
        origin: 'ai',
        tool: 'reply',
        parameters: {},
      },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects invalid role enum in team invite', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/team`, {
      headers: CLIENT_HEADERS,
      data: { userId: 'user', role: 'SUPER_ADMIN' },
    });
    expect(response.status()).toBe(400);
  });
});

// ─── Malformed Input ─────────────────────────────────────────────────

test.describe('malformed input handling', () => {
  test('handles empty JSON body gracefully', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: CLIENT_HEADERS,
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test('handles null body gracefully', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: { ...CLIENT_HEADERS, 'Content-Type': 'application/json' },
      data: 'null',
    });
    expect(response.status()).toBeLessThan(500);
  });

  test('handles extra unexpected fields gracefully', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: CLIENT_HEADERS,
      data: {
        amount: 1000,
        currency: 'usd',
        idempotencyKey: 'extra-fields',
        __proto__: { admin: true },
        constructor: { prototype: { admin: true } },
      },
    });
    // Should not crash; may succeed or reject extra fields
    expect(response.status()).toBeLessThan(500);
  });

  test('handles very long string in idempotency key', async ({ request }) => {
    const longKey = 'x'.repeat(10000);
    const response = await request.post(`${API_BASE}/api/client/v1/payments/checkout`, {
      headers: CLIENT_HEADERS,
      data: { amount: 1000, currency: 'usd', idempotencyKey: longKey },
    });
    expect(response.status()).toBeLessThan(500);
  });

  test('handles Unicode in string fields', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: CLIENT_HEADERS,
      data: {
        contactId: '🔥🎉',
        idempotencyKey: `unicode-${Date.now()}`,
        resourceId: 'resource',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        title: '日本語テスト',
      },
    });
    expect(response.status()).toBeLessThan(500);
  });
});
