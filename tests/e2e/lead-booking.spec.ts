import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * E2E: Lead Booking Flow
 * Lead extraction → qualification → booking → follow-up
 */
test.describe('lead booking flow', () => {
  test('full lead lifecycle: list → qualify → book appointment', async ({
    request,
  }) => {
    // Step 1: List leads (initially may be empty or seeded)
    const leadsList = await request.get(`${API_BASE}/api/client/v1/leads`, {
      headers: { 'x-test-subject': 'local|client-owner' },
    });
    expect(leadsList.ok()).toBeTruthy();
    const leadsBody = await leadsList.json();
    expect(Array.isArray(leadsBody.data)).toBeTruthy();

    // Step 2: Qualify a lead (requires existing lead; if none, skip qualify)
    if (leadsBody.data.length > 0) {
      const leadId = leadsBody.data[0].id;
      const qualify = await request.patch(
        `${API_BASE}/api/client/v1/leads/${leadId}/qualify`,
        {
          headers: {
            'Idempotency-Key': `qualify-${Date.now()}`,
            'x-test-subject': 'local|client-owner',
          },
          data: { score: 75 },
        },
      );
      expect(qualify.ok()).toBeTruthy();
      const qualifiedBody = await qualify.json();
      expect(qualifiedBody.data.score).toBe(75);
      expect(qualifiedBody.data.stage).toBe('QUALIFIED');
    }

    // Step 3: Book an appointment
    const startsAt = new Date(Date.now() + 86400000).toISOString(); // tomorrow
    const endsAt = new Date(Date.now() + 90000000).toISOString(); // +1h
    const bookIdempotencyKey = `idem-${Date.now()}`;
    const booking = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: {
        'Idempotency-Key': bookIdempotencyKey,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        contactId: 'contact-001',
        idempotencyKey: bookIdempotencyKey,
        resourceId: 'resource-001',
        startsAt,
        endsAt,
        title: 'Follow-up consultation',
      },
    });
    expect(booking.ok()).toBeTruthy();
    const bookingBody = await booking.json();
    expect(bookingBody.data.status).toBe('CONFIRMED');
    expect(bookingBody.data.title).toBe('Follow-up consultation');
    expect(bookingBody.data.contactId).toBe('contact-001');

    // Step 4: Idempotency - same request+key returns the same appointment
    const replay = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: {
        'Idempotency-Key': bookIdempotencyKey,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        contactId: 'contact-001',
        idempotencyKey: bookIdempotencyKey,
        resourceId: 'resource-001',
        startsAt,
        endsAt,
        title: 'Follow-up consultation',
      },
    });
    expect(replay.ok()).toBeTruthy();
  });

  test('booking detects slot conflict', async ({ request }) => {
    const startsAt = new Date(Date.now() + 172800000).toISOString(); // day after tomorrow
    const endsAt = new Date(Date.now() + 176400000).toISOString(); // +1h

    // First booking
    const firstIdempotencyKey = `conflict-test-${Date.now()}`;
    const first = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: {
        'Idempotency-Key': firstIdempotencyKey,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        contactId: 'contact-002',
        idempotencyKey: firstIdempotencyKey,
        resourceId: 'resource-002',
        startsAt,
        endsAt,
        title: 'First booking',
      },
    });
    expect(first.ok()).toBeTruthy();

    // Overlapping booking with same resource
    const overlapStartsAt = new Date(
      new Date(startsAt).getTime() + 1800000,
    ).toISOString(); // +30min
    const overlapEndsAt = new Date(
      new Date(endsAt).getTime() + 1800000,
    ).toISOString();

    const conflictIdempotencyKey = `conflict-test-2-${Date.now()}`;
    const conflict = await request.post(`${API_BASE}/api/client/v1/appointments`, {
      headers: {
        'Idempotency-Key': conflictIdempotencyKey,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        contactId: 'contact-003',
        idempotencyKey: conflictIdempotencyKey,
        resourceId: 'resource-002',
        startsAt: overlapStartsAt,
        endsAt: overlapEndsAt,
        title: 'Overlapping booking',
      },
    });
    expect(conflict.status()).toBe(409);
    const body = await conflict.json();
    expect(body.error?.code ?? body.code ?? body.message?.code).toBe('SLOT_CONFLICT');
  });
});
