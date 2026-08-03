import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

/**
 * Fase 3 (R-12 / GAP-012) regression: optional modules are OFF until a tenant
 * buys them, and the core must be deployable with them disabled.
 *
 * This suite deliberately does NOT enable any optional capability, so it fails
 * if a module's surface ever becomes reachable by default.
 */
describe('optional modules are closed until entitled', () => {
  let app: NestFastifyApplication;
  const previous: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of [
      'CHAI_CAPABILITY_PAYMENT_ORCHESTRATION',
      'CHAI_CAPABILITY_SHIPMENT_TRACKING',
    ]) {
      previous[key] = process.env[key];
      Reflect.deleteProperty(process.env, key);
    }
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    await app.close();
  });

  it('answers FEATURE_NOT_ENABLED for the payment surface', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ent-pay-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { idempotencyKey: 'ent-1', invoiceId: 'irrelevant-because-entitlement-denied-first' },
      url: '/api/client/v1/payments/checkout',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('FEATURE_NOT_ENABLED');
  });

  it('answers FEATURE_NOT_ENABLED for the shipment surface', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ent-ship-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { carrier: 'jne', trackingNumber: 'TRK-ENT-1' },
      url: '/api/client/v1/logistics/shipments',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('FEATURE_NOT_ENABLED');
  });

  it('keeps core surfaces reachable with every optional module disabled', async () => {
    const conversations = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    expect(conversations.statusCode).toBe(200);

    const knowledge = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/knowledge/documents',
    });
    expect(knowledge.statusCode).toBe(200);
  });

  it('refuses an AI tool from a module the tenant has not bought', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ent-tool-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        confirmed: true,
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: {},
        tool: 'payment.create_link',
      },
      url: '/api/client/v1/actions/evaluate',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('FEATURE_NOT_ENABLED');
  });

  it('still hard-denies a critical AI tool regardless of entitlement', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'ent-tool-2',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        approvedBy: 'someone',
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: {},
        tool: 'payment.execute_refund',
      },
      url: '/api/client/v1/actions/evaluate',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('AI_EXECUTION_FORBIDDEN');
  });
});
