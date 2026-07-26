import type {
  CalendarAdapter,
  CalendarAvailabilityRequest,
  CalendarSlot,
} from '@chai/connector-sdk';

export type {
  CalendarAdapter,
  CalendarAvailabilityRequest,
  CalendarSlot,
} from '@chai/connector-sdk';

export type BookedSlot = CalendarSlot;

/**
 * Deterministic mock calendar adapter. Generates fixed-shape availability
 * windows and subtracts bookings so the booking slice is exercisable offline.
 */
export function createMockCalendarAdapter(): CalendarAdapter {
  const bookings = new Map<string, CalendarSlot[]>();

  return {
    acceptBooking(tenantId: string, slot: CalendarSlot): void {
      const list = bookings.get(tenantId) ?? [];
      list.push(slot);
      bookings.set(tenantId, list);
    },

    async listAvailability(
      request: CalendarAvailabilityRequest,
    ): Promise<CalendarSlot[]> {
      const taken = bookings.get(request.tenantId) ?? [];
      const slots: CalendarSlot[] = [];
      const cursor = new Date(request.windowStart);
      while (cursor < request.windowEnd && slots.length < 12) {
        const endsAt = new Date(cursor.getTime() + 3_600_000);
        for (const resourceId of request.resourceIds) {
          const blocked = taken.some(
            (booked) =>
              booked.resourceId === resourceId &&
              booked.startsAt < endsAt &&
              booked.endsAt > cursor,
          );
          if (!blocked) {
            slots.push({ endsAt, resourceId, startsAt: new Date(cursor) });
          }
        }
        cursor.setMinutes(cursor.getMinutes() + 90);
      }
      return slots;
    },
  };
}
