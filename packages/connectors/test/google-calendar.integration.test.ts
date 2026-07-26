import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createGoogleCalendarAdapter } from '../src/connectors/google-calendar';
import {
  generateAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  getValidTokens,
  clearTokens,
} from '../src/connectors/google-calendar/oauth';

const TENANT = 'tenant-test-123';
const CALENDAR_ID = 'test@example.com';

const mockOAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/callback',
  scopes: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
};

describe('Google Calendar OAuth', () => {
  beforeEach(() => {
    clearTokens(TENANT);
  });

  afterEach(() => {
    clearTokens(TENANT);
    vi.restoreAllMocks();
  });

  describe('generateAuthorizationUrl', () => {
    it('generates valid authorization URL', () => {
      const url = generateAuthorizationUrl(mockOAuthConfig, TENANT);

      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain(`client_id=${mockOAuthConfig.clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(mockOAuthConfig.redirectUri)}`);
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
      expect(url).toContain(`state=${TENANT}`);
    });

    it('includes custom state parameter', () => {
      const url = generateAuthorizationUrl(mockOAuthConfig, TENANT, 'custom-state');
      expect(url).toContain('state=custom-state');
    });

    it('includes required scopes', () => {
      const url = generateAuthorizationUrl(mockOAuthConfig, TENANT);
      expect(url).toContain('calendar.readonly');
      expect(url).toContain('calendar.events');
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('exchanges code for tokens', async () => {
      const mockResponse = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      const tokens = await exchangeAuthorizationCode(
        mockOAuthConfig,
        'test-code',
        TENANT,
      );

      expect(tokens.access_token).toBe('test-access-token');
      expect(tokens.refresh_token).toBe('test-refresh-token');
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('code=test-code'),
        }),
      );
    });

    it('throws on failed exchange', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid code',
      });
      global.fetch = mockFetch;

      await expect(
        exchangeAuthorizationCode(mockOAuthConfig, 'bad-code', TENANT),
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes expired token', async () => {
      // First, store some tokens.
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'old-token',
            refresh_token: 'test-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'calendar',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'calendar',
          }),
        });
      global.fetch = mockFetch;

      await exchangeAuthorizationCode(mockOAuthConfig, 'code', TENANT);
      const refreshed = await refreshAccessToken(mockOAuthConfig, TENANT);

      expect(refreshed.access_token).toBe('new-token');
      expect(refreshed.refresh_token).toBe('test-refresh');
    });

    it('throws when no refresh token available', async () => {
      await expect(refreshAccessToken(mockOAuthConfig, TENANT)).rejects.toThrow(
        'No refresh token available',
      );
    });
  });

  describe('getValidTokens', () => {
    it('returns null when no tokens stored', async () => {
      const tokens = await getValidTokens(mockOAuthConfig, TENANT);
      expect(tokens).toBeNull();
    });

    it('returns valid tokens when not expired', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'valid-token',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'calendar',
        }),
      });
      global.fetch = mockFetch;

      await exchangeAuthorizationCode(mockOAuthConfig, 'code', TENANT);
      const tokens = await getValidTokens(mockOAuthConfig, TENANT);

      expect(tokens?.access_token).toBe('valid-token');
    });

    it('refreshes expired tokens automatically', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'old-token',
            refresh_token: 'refresh',
            expires_in: -100, // Already expired
            token_type: 'Bearer',
            scope: 'calendar',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'calendar',
          }),
        });
      global.fetch = mockFetch;

      await exchangeAuthorizationCode(mockOAuthConfig, 'code', TENANT);
      const tokens = await getValidTokens(mockOAuthConfig, TENANT);

      expect(tokens?.access_token).toBe('new-token');
    });
  });
});

describe('Google Calendar adapter', () => {
  beforeEach(() => {
    clearTokens(TENANT);
  });

  afterEach(() => {
    clearTokens(TENANT);
    vi.restoreAllMocks();
  });

  describe('sandbox mode (no OAuth)', () => {
    it('returns synthetic availability grid', async () => {
      const adapter = createGoogleCalendarAdapter();
      const start = new Date('2026-07-20T09:00:00Z');
      const end = new Date('2026-07-20T12:00:00Z');

      const slots = await adapter.listAvailability({
        resourceIds: ['chair-1', 'chair-2'],
        tenantId: TENANT,
        windowStart: start,
        windowEnd: end,
      });

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s) => s.endsAt > s.startsAt)).toBe(true);
    });

    it('subtracts accepted bookings', async () => {
      const adapter = createGoogleCalendarAdapter();
      const start = new Date('2026-07-20T09:00:00Z');
      const end = new Date('2026-07-20T11:00:00Z');

      adapter.acceptBooking(TENANT, {
        resourceId: 'chair-1',
        startsAt: new Date('2026-07-20T09:00:00Z'),
        endsAt: new Date('2026-07-20T10:00:00Z'),
      });

      const slots = await adapter.listAvailability({
        resourceIds: ['chair-1'],
        tenantId: TENANT,
        windowStart: start,
        windowEnd: end,
      });

      expect(
        slots.every(
          (s) =>
            s.resourceId !== 'chair-1' ||
            s.startsAt.getTime() !== start.getTime(),
        ),
      ).toBe(true);
    });

    it('throws when createEvent called without OAuth', async () => {
      const adapter = createGoogleCalendarAdapter();

      await expect(
        (adapter as unknown as { createEvent: (t: string, c: string, e: { summary: string; start: Date; end: Date }) => Promise<unknown> }).createEvent(TENANT, CALENDAR_ID, {
          summary: 'Test',
          start: new Date(),
          end: new Date(),
        }),
      ).rejects.toThrow('requires OAuth config');
    });
  });

  describe('production mode (with OAuth)', () => {
    it('calls freebusy API when tokens available', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            refresh_token: 'refresh',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'calendar',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            calendars: {
              [CALENDAR_ID]: {
                busy: [
                  {
                    start: '2026-07-20T10:00:00Z',
                    end: '2026-07-20T11:00:00Z',
                  },
                ],
              },
            },
          }),
        });
      global.fetch = mockFetch;

      await exchangeAuthorizationCode(mockOAuthConfig, 'code', TENANT);

      const adapter = createGoogleCalendarAdapter({
        oauthConfig: mockOAuthConfig,
        defaultCalendarId: CALENDAR_ID,
      });

      const slots = await adapter.listAvailability({
        resourceIds: [CALENDAR_ID],
        tenantId: TENANT,
        windowStart: new Date('2026-07-20T09:00:00Z'),
        windowEnd: new Date('2026-07-20T12:00:00Z'),
      });

      expect(slots.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/freeBusy'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('creates calendar event via API', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            refresh_token: 'refresh',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'calendar',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'event-123',
            htmlLink: 'https://calendar.google.com/event/123',
          }),
        });
      global.fetch = mockFetch;

      await exchangeAuthorizationCode(mockOAuthConfig, 'code', TENANT);

      const adapter = createGoogleCalendarAdapter({
        oauthConfig: mockOAuthConfig,
      });

      const result = await (adapter as unknown as { createEvent: (t: string, c: string, e: { summary: string; description?: string; start: Date; end: Date; attendees?: string[] }) => Promise<{ id: string; eventId?: string; htmlLink?: string }> }).createEvent(
        TENANT,
        CALENDAR_ID,
        {
          summary: 'Team Meeting',
          description: 'Weekly sync',
          start: new Date('2026-07-20T10:00:00Z'),
          end: new Date('2026-07-20T11:00:00Z'),
          attendees: ['user@example.com'],
        },
      );

      expect(result.eventId).toBe('event-123');
      expect(result.htmlLink).toContain('calendar.google.com');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/calendars/${encodeURIComponent(CALENDAR_ID)}/events`),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when createEvent called without tokens', async () => {
      const adapter = createGoogleCalendarAdapter({
        oauthConfig: mockOAuthConfig,
      });

      await expect(
        (adapter as unknown as { createEvent: (t: string, c: string, e: { summary: string; start: Date; end: Date }) => Promise<unknown> }).createEvent(TENANT, CALENDAR_ID, {
          summary: 'Test',
          start: new Date(),
          end: new Date(),
        }),
      ).rejects.toThrow('No valid tokens');
    });

    it('falls back to sandbox when API call fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            refresh_token: 'refresh',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'calendar',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        });
      global.fetch = mockFetch;

      await exchangeAuthorizationCode(mockOAuthConfig, 'code', TENANT);

      const adapter = createGoogleCalendarAdapter({
        oauthConfig: mockOAuthConfig,
      });

      const slots = await adapter.listAvailability({
        resourceIds: ['chair-1'],
        tenantId: TENANT,
        windowStart: new Date('2026-07-20T09:00:00Z'),
        windowEnd: new Date('2026-07-20T12:00:00Z'),
      });

      // Should fall back to synthetic grid
      expect(slots.length).toBeGreaterThan(0);
    });
  });
});
