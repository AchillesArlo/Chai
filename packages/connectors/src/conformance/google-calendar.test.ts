import { describe, expect, it } from 'vitest';

import { createGoogleCalendarAdapter } from '../connectors/google-calendar';

describe('google calendar adapter (sandbox)', () => {
  it('lists availability windows across resources', async () => {
    const adapter = createGoogleCalendarAdapter();
    const start = new Date('2026-07-20T09:00:00Z');
    const end = new Date('2026-07-20T12:00:00Z');

    const slots = await adapter.listAvailability({
      resourceIds: ['chair-1', 'chair-2'],
      tenantId: 'tenant-a',
      windowEnd: end,
      windowStart: start,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.endsAt > slot.startsAt)).toBe(true);
    expect(new Set(slots.map((slot) => slot.resourceId))).toEqual(new Set(['chair-1', 'chair-2']));
  });

  it('subtracts already-accepted bookings from availability', async () => {
    const adapter = createGoogleCalendarAdapter();
    const start = new Date('2026-07-20T09:00:00Z');
    const end = new Date('2026-07-20T11:00:00Z');

    adapter.acceptBooking('tenant-a', {
      endsAt: new Date('2026-07-20T10:00:00Z'),
      resourceId: 'chair-1',
      startsAt: new Date('2026-07-20T09:00:00Z'),
    });

    const slots = await adapter.listAvailability({
      resourceIds: ['chair-1'],
      tenantId: 'tenant-a',
      windowEnd: end,
      windowStart: start,
    });

    expect(slots.every((slot) => slot.resourceId !== 'chair-1' || slot.startsAt.getTime() !== start.getTime())).toBe(true);
  });

  it('returns synthetic grid when serviceAccountJson is unset', async () => {
    const adapter = createGoogleCalendarAdapter();
    const start = new Date('2026-07-20T09:00:00Z');
    const end = new Date('2026-07-20T10:30:00Z');

    const slots = await adapter.listAvailability({
      resourceIds: ['chair-1'],
      tenantId: 'tenant-a',
      windowEnd: end,
      windowStart: start,
    });

    expect(slots.length).toBeGreaterThan(0);
  });

  it('still returns synthetic grid when serviceAccountJson is set (ponytail)', async () => {
    const adapter = createGoogleCalendarAdapter({ serviceAccountJson: '{}' });
    const start = new Date('2026-07-20T09:00:00Z');
    const end = new Date('2026-07-20T10:30:00Z');

    const slots = await adapter.listAvailability({
      resourceIds: ['chair-1'],
      tenantId: 'tenant-a',
      windowEnd: end,
      windowStart: start,
    });

    expect(slots.length).toBeGreaterThan(0);
  });
});
