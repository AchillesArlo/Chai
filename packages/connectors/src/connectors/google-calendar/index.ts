import type {
  CalendarAdapter,
  CalendarAvailabilityRequest,
  CalendarSlot,
} from '@chai/connector-sdk';

import { getValidTokens, type GoogleOAuthConfig } from './oauth';

export type {
  CalendarAdapter,
  CalendarAvailabilityRequest,
  CalendarSlot,
} from '@chai/connector-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleCalendarOptions {
  /** @deprecated Use OAuth config instead. Kept for backward compatibility. */
  serviceAccountJson?: string;
  tenantIdHint?: string;
  /** OAuth 2.0 config. When present, the adapter uses the real Calendar API. */
  oauthConfig?: GoogleOAuthConfig;
  /** Default calendar ID (email) to query when resourceIds are absent. */
  defaultCalendarId?: string;
  /** Override the Calendar API base URL (useful for tests / proxies). */
  calendarApiBaseUrl?: string;
}

export const GoogleCalendarCapabilities = {
  connectorKey: 'google-calendar',
  riskClass: 'OFFICIAL',
  slaClass: 'STAGING',
} as const;

/**
 * Extended calendar adapter with event creation capability.
 * This extends the base CalendarAdapter interface with production features.
 */
export interface GoogleCalendarAdapter extends CalendarAdapter {
  createEvent(
    tenantId: string,
    calendarId: string,
    event: {
      summary: string;
      description?: string;
      start: Date;
      end: Date;
      attendees?: string[];
    },
  ): Promise<{ eventId: string; htmlLink?: string }>;
}

// ---------------------------------------------------------------------------
// Google Calendar API types
// ---------------------------------------------------------------------------

interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  transparency?: string;
  attendees?: Array<{ email: string; responseStatus?: string }>;
}

interface FreeBusyGroup {
  busy?: Array<{ start: string; end: string }>;
  errors?: Array<{ reason?: string }>;
}

interface FreeBusyResponse {
  calendars?: Record<string, FreeBusyGroup>;
  timeRange?: { start?: string; end?: string };
}

interface InsertEventResponse {
  id?: string;
  status?: string;
  htmlLink?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Fetch busy windows for a set of calendar IDs using the freebusy.query API.
 * Returns an array of { start, end } ISO strings.
 */
async function fetchFreeBusy(
  accessToken: string,
  calendarIds: string[],
  windowStart: Date,
  windowEnd: Date,
  apiBase: string,
): Promise<Array<{ start: Date; end: Date }>> {
  const url = `${apiBase}/freeBusy`;
  const body = {
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    items: calendarIds.map((id) => ({ id })),
    timeZone: 'UTC',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`freebusy.query failed: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as FreeBusyResponse;
  const busy: Array<{ start: Date; end: Date }> = [];

  for (const calendarId of calendarIds) {
    const group = data.calendars?.[calendarId];
    if (group?.errors?.length) {
      console.warn(
        `[google-calendar] freebusy errors for ${calendarId}:`,
        group.errors.map((e) => e.reason).join(', '),
      );
      continue;
    }
    for (const slot of group?.busy ?? []) {
      busy.push({ start: new Date(slot.start), end: new Date(slot.end) });
    }
  }

  // Sort and merge overlapping intervals.
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Array<{ start: Date; end: Date }> = [];
  for (const slot of busy) {
    const last = merged[merged.length - 1];
    if (last && last.end >= slot.start) {
      last.end = slot.end > last.end ? slot.end : last.end;
    } else {
      merged.push({ start: new Date(slot.start), end: new Date(slot.end) });
    }
  }
  return merged;
}

/**
 * Insert an event into a Google Calendar.
 */
async function insertCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent,
  apiBase: string,
): Promise<InsertEventResponse> {
  const url = `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`events.insert failed: ${res.status} ${errorText}`);
  }

  return (await res.json()) as InsertEventResponse;
}

/**
 * Generate free time slots from busy windows.
 */
function computeFreeSlots(
  busyWindows: Array<{ start: Date; end: Date }>,
  windowStart: Date,
  windowEnd: Date,
  resourceIds: string[],
  slotDurationMs: number = 3_600_000, // 1 hour default
  maxSlots: number = 12,
): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  const cursor = new Date(windowStart);

  while (cursor < windowEnd && slots.length < maxSlots) {
    const slotEnd = new Date(cursor.getTime() + slotDurationMs);

    for (const resourceId of resourceIds) {
      // Check if this slot overlaps with any busy window.
      const isBlocked = busyWindows.some(
        (busy) => busy.start < slotEnd && busy.end > cursor,
      );
      if (!isBlocked) {
        slots.push({
          resourceId,
          startsAt: new Date(cursor),
          endsAt: slotEnd,
        });
      }
    }

    cursor.setMinutes(cursor.getMinutes() + 90);
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

/**
 * Google Calendar adapter with real API integration via OAuth 2.0.
 *
 * - When `oauthConfig` is provided and tokens are available for the tenant,
 *   the adapter calls the real Calendar API (freebusy.query + events.insert).
 * - Otherwise, falls back to the synthetic sandbox grid for offline dev.
 */
export function createGoogleCalendarAdapter(
  options: GoogleCalendarOptions = {},
): GoogleCalendarAdapter {
  const bookings = new Map<string, CalendarSlot[]>();
  const apiBase = options.calendarApiBaseUrl ?? DEFAULT_CALENDAR_API_BASE;

  return {
    acceptBooking(tenantId: string, slot: CalendarSlot): void {
      const list = bookings.get(tenantId) ?? [];
      list.push(slot);
      bookings.set(tenantId, list);
    },

    async listAvailability(
      request: CalendarAvailabilityRequest,
    ): Promise<CalendarSlot[]> {
      // Try real API if OAuth is configured.
      if (options.oauthConfig) {
        try {
          const tokens = await getValidTokens(
            options.oauthConfig,
            request.tenantId,
          );
          if (tokens) {
            const calendarIds =
              request.resourceIds.length > 0
                ? request.resourceIds
                : [options.defaultCalendarId ?? 'primary'];

            const busyWindows = await fetchFreeBusy(
              tokens.access_token,
              calendarIds,
              request.windowStart,
              request.windowEnd,
              apiBase,
            );

            return computeFreeSlots(
              busyWindows,
              request.windowStart,
              request.windowEnd,
              request.resourceIds.length > 0
                ? request.resourceIds
                : ['primary'],
            );
          }
        } catch (err) {
          console.warn(
            '[google-calendar] Real API call failed, falling back to sandbox:',
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      // Sandbox fallback: synthetic grid minus accepted bookings.
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

    /**
     * Create a real calendar event. Only available when OAuth tokens exist.
     * This is an extension method beyond the CalendarAdapter interface.
     */
    async createEvent(
      tenantId: string,
      calendarId: string,
      event: {
        summary: string;
        description?: string;
        start: Date;
        end: Date;
        attendees?: string[];
      },
    ): Promise<{ eventId: string; htmlLink?: string }> {
      if (!options.oauthConfig) {
        throw new Error(
          '[google-calendar] createEvent requires OAuth config. Set oauthConfig in adapter options.',
        );
      }

      const tokens = await getValidTokens(options.oauthConfig, tenantId);
      if (!tokens) {
        throw new Error(
          `[google-calendar] No valid tokens for tenant ${tenantId}. Complete OAuth flow first.`,
        );
      }

      const calendarEvent: CalendarEvent = {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start.toISOString(), timeZone: 'UTC' },
        end: { dateTime: event.end.toISOString(), timeZone: 'UTC' },
        attendees: event.attendees?.map((email) => ({ email })),
      };

      const result = await insertCalendarEvent(
        tokens.access_token,
        calendarId,
        calendarEvent,
        apiBase,
      );

      return {
        eventId: result.id ?? 'unknown',
        htmlLink: result.htmlLink,
      };
    },
  };
}
