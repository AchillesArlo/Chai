import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

/**
 * FASE 10 (REQ-17-033, REQ-17-053, REQ-17-066, REQ-09-026):
 *
 * Route-level tests proving that a guessed tracking number does NOT disclose
 * the existence of a shipment.  The GET /shipments/:trackingNumber route now
 * requires proof of ownership — `contactId` or `orderReference` as query
 * params — and fails closed (returns 404) when proof is absent or wrong.
 */

const CONTACT_ID = 'contact-owner-001';
const ORDER_REF = 'ORDER-OWN-001';

describe('route-level ownership verification (FASE 10)', () => {
  let app: NestFastifyApplication;

  beforeAll(() => {
    process.env.CHAI_CAPABILITY_SHIPMENT_TRACKING = 'true';
  });

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Create a shipment with ownership proof recorded
    const link = await app.inject({
      headers: {
        'idempotency-key': 'own-link-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        carrier: 'mock-express',
        contactId: CONTACT_ID,
        orderReference: ORDER_REF,
        trackingNumber: 'TRK-OWNED-ROUTE',
      },
      url: '/api/client/v1/logistics/shipments',
    });
    expect(link.statusCode).toBe(201);

    // Create a shipment WITHOUT any ownership proof
    const link2 = await app.inject({
      headers: {
        'idempotency-key': 'own-link-2',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        carrier: 'mock-express',
        trackingNumber: 'TRK-NO-OWNER-ROUTE',
      },
      url: '/api/client/v1/logistics/shipments',
    });
    expect(link2.statusCode).toBe(201);
  });

  afterAll(async () => app.close());

  // ---- Positive cases ----

  it('returns 200 when proof of ownership by contactId is supplied', async () => {
    const res = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/logistics/shipments/TRK-OWNED-ROUTE?contactId=${CONTACT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.trackingNumber).toBe('TRK-OWNED-ROUTE');
  });

  it('returns 200 when proof of ownership by orderReference is supplied', async () => {
    const res = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/logistics/shipments/TRK-OWNED-ROUTE?orderReference=${ORDER_REF}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.trackingNumber).toBe('TRK-OWNED-ROUTE');
  });

  // ---- Negative cases: guessed tracking number ----

  it('returns 404 when no proof is supplied (tracking number alone)', async () => {
    const res = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/logistics/shipments/TRK-OWNED-ROUTE',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when wrong contactId is supplied', async () => {
    const res = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/logistics/shipments/TRK-OWNED-ROUTE?contactId=wrong-contact',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when wrong orderReference is supplied', async () => {
    const res = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/logistics/shipments/TRK-OWNED-ROUTE?orderReference=WRONG-ORDER',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for a completely unknown tracking number', async () => {
    const res = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/logistics/shipments/TRK-GUESSED-999?contactId=${CONTACT_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for a shipment with no recorded owner (fail-closed, ADR-027)', async () => {
    const res = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/logistics/shipments/TRK-NO-OWNER-ROUTE?contactId=${CONTACT_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });
});
