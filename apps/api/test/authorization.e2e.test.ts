import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

/**
 * R-03 and R-07 regression: audience alone is not authorization.
 *
 * Every case here fails if AuthorizationGuard stops being registered globally,
 * if a @RequirePermission annotation is dropped, or if refund/recurring stop
 * being gated behind their capability flag and recent authentication
 * (10_SECURITY §5, §20; 17_PAYMENT §2.10).
 */
describe('per-permission authorization is enforced', () => {
  let app: NestFastifyApplication;

  beforeAll(() => {
    // Optional modules are OFF by default (GAP-012); this suite exercises them,
    // so it opts in explicitly instead of relying on a permissive default.
    process.env.CHAI_CAPABILITY_PAYMENT_ORCHESTRATION = 'true';
    process.env.CHAI_CAPABILITY_SHIPMENT_TRACKING = 'true';
  });

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('lets a role holding payment.read poll a session but not create one', async () => {
    const created = await app.inject({
      headers: {
        'idempotency-key': 'authz-viewer-1',
        'x-test-subject': 'local|client-viewer',
      },
      method: 'POST',
      payload: { amount: 10_000, currency: 'IDR', idempotencyKey: 'authz-1' },
      url: '/api/client/v1/payments/checkout',
    });

    // CLIENT_VIEWER holds payment.read but not payment.manage.
    expect(created.statusCode).toBe(403);
  });

  it('allows checkout for a role holding payment.manage', async () => {
    const created = await app.inject({
      headers: {
        'idempotency-key': 'authz-owner-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { amount: 10_000, currency: 'IDR', idempotencyKey: 'authz-2' },
      url: '/api/client/v1/payments/checkout',
    });

    expect(created.statusCode).toBe(201);
  });

  it('refuses shipment mutation for a role without shipment.manage', async () => {
    const linked = await app.inject({
      headers: {
        'idempotency-key': 'authz-ship-1',
        'x-test-subject': 'local|client-viewer',
      },
      method: 'POST',
      payload: { carrier: 'jne', trackingNumber: 'TRACK-AUTHZ-1' },
      url: '/api/client/v1/logistics/shipments',
    });

    expect(linked.statusCode).toBe(403);
  });

  it('keeps refund execution closed even for an approver role', async () => {
    const refund = await app.inject({
      headers: {
        'idempotency-key': 'authz-refund-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        amountCents: 1_000,
        idempotencyKey: 'authz-refund-1',
        providerRef: 'prov-refund-1',
        reason: 'customer request',
      },
      url: '/api/client/v1/payments/some-payment/refunds',
    });

    expect(refund.statusCode).toBe(403);
    expect(refund.body).toContain('FEATURE_NOT_ENABLED');
  });

  it('refuses refund for a role without payment.approve', async () => {
    const refund = await app.inject({
      headers: {
        'idempotency-key': 'authz-refund-2',
        'x-test-subject': 'local|client-agent',
      },
      method: 'POST',
      payload: {
        amountCents: 1_000,
        idempotencyKey: 'authz-refund-2',
        providerRef: 'prov-refund-2',
        reason: 'customer request',
      },
      url: '/api/client/v1/payments/some-payment/refunds',
    });

    expect(refund.statusCode).toBe(403);
    // Permission is checked by the guard before the capability gate runs, so the
    // caller never learns whether the capability is enabled.
    expect(refund.body).not.toContain('FEATURE_NOT_ENABLED');
  });

  it('keeps recurring mandates closed', async () => {
    const subscription = await app.inject({
      headers: {
        'idempotency-key': 'authz-sub-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        amountCents: 10_000,
        billingCycle: 'MONTHLY',
        currency: 'IDR',
        customerId: 'cust-1',
        idempotencyKey: 'authz-sub-1',
        planId: 'plan-1',
        providerRef: 'prov-sub-1',
      },
      url: '/api/client/v1/subscriptions',
    });

    expect(subscription.statusCode).toBe(403);
    expect(subscription.body).toContain('FEATURE_NOT_ENABLED');
  });
});
