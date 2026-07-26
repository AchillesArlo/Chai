# S3-1: Google Calendar Production Integration

## Overview

Production-ready Google Calendar adapter with:
- OAuth 2.0 authorization flow (authorization code + refresh tokens)
- Real Calendar API calls: `freebusy.query` for availability, `events.insert` for bookings
- In-memory token storage (per-tenant, upgradeable to persistent store)
- Automatic fallback to synthetic sandbox when OAuth tokens are absent

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Production | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Production | OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | Production | Callback URL (e.g., `https://your-domain.com/oauth/google/callback`) |

## Google Cloud Console Setup

### 1. Create OAuth Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services > Library**
4. Enable the **Google Calendar API**
5. Navigate to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth 2.0 Client ID**
7. Application type: **Web application**
8. Add authorized redirect URIs (e.g., `https://your-domain.com/oauth/google/callback`)
9. Note the **Client ID** and **Client Secret**

### 2. Configure OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**
2. Choose **External** user type (or Internal if using Google Workspace)
3. Fill in:
   - App name: Your platform name
   - User support email: Your support email
   - Developer contact: Your email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
5. Add test users (for unverified apps)
6. Submit for verification (if publishing publicly)

### 3. Required OAuth Scopes

| Scope | Purpose |
|---|---|
| `calendar.readonly` | Read calendar events (freebusy.query, events.list) |
| `calendar.events` | Create and modify events (events.insert) |

## OAuth Flow

### Step 1: Generate Authorization URL
```typescript
import { generateAuthorizationUrl } from '@chai/connectors/google-calendar/oauth';

const url = generateAuthorizationUrl(
  {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  },
  tenantId,
);
// Redirect user to `url`
```

### Step 2: Exchange Authorization Code
```typescript
import { exchangeAuthorizationCode } from '@chai/connectors/google-calendar/oauth';

// After user authorizes, Google redirects back with `code` query param
const tokens = await exchangeAuthorizationCode(oauthConfig, code, tenantId);
// Tokens are stored in-memory for this tenant
```

### Step 3: Automatic Token Refresh
The adapter automatically refreshes expired tokens using the stored refresh token. No manual intervention required.

## Production Deployment Checklist

- [ ] Enable Google Calendar API in Google Cloud Console
- [ ] Create OAuth 2.0 credentials (Web application type)
- [ ] Configure OAuth consent screen with required scopes
- [ ] Add authorized redirect URIs
- [ ] Set environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`)
- [ ] Complete OAuth flow for each tenant (store tokens)
- [ ] Run integration tests: `pnpm vitest run test/google-calendar.integration.test.ts`
- [ ] Verify `listAvailability()` returns real calendar data
- [ ] Verify `createEvent()` creates events in Google Calendar
- [ ] Monitor token refresh failures (expired refresh tokens require re-authorization)

## API Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `https://www.googleapis.com/calendar/v3/freeBusy` | Query busy windows for availability |
| POST | `https://www.googleapis.com/calendar/v3/calendars/{id}/events` | Create calendar events |
| POST | `https://oauth2.googleapis.com/token` | Exchange/refresh OAuth tokens |

## Sandbox Behavior

When OAuth tokens are not available for a tenant:
- `listAvailability()` returns a synthetic grid (90-min slots, 12 max, minus accepted bookings)
- `createEvent()` throws an error with instructions to complete OAuth flow
- No network calls are made

## Token Storage

Current implementation: **In-memory** (`Map<tenantId, tokens>`)

For production, replace with a persistent store:
```typescript
// Example: Database-backed token store
const tokenStore = {
  get: async (tenantId: string) => db.tokens.findUnique({ where: { tenantId } }),
  set: async (tenantId: string, tokens: GoogleOAuthTokens) =>
    db.tokens.upsert({ where: { tenantId }, update: tokens, create: { tenantId, ...tokens } }),
  delete: async (tenantId: string) => db.tokens.delete({ where: { tenantId } }),
};
```

## File Structure

```
packages/connectors/src/connectors/google-calendar/
  index.ts          # Production adapter (Calendar API + sandbox fallback)
  oauth.ts          # OAuth 2.0 flow (authorization, token exchange, refresh)
packages/connectors/test/
  google-calendar.integration.test.ts  # Integration tests
```
