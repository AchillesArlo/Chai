# S3-1: WhatsApp Meta Production Integration

## Overview

Production-ready Meta Cloud API (WhatsApp Business Platform) adapter with:
- Real Graph API message sending (`POST /v18.0/{phone-number-id}/messages`)
- HMAC-SHA256 webhook signature verification (`X-Hub-Signature-256`)
- Automatic fallback to sandbox mode when credentials are absent

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Production | Permanent access token from Meta Business dashboard |
| `WHATSAPP_APP_SECRET` | Production | App secret for HMAC-SHA256 webhook verification |
| `WHATSAPP_PHONE_NUMBER_ID` | Production | Phone number ID from Meta Business dashboard |

## Sandbox Setup (No Credentials)

When no env vars are set, the adapter operates in sandbox mode:
- `sendMessage()` returns a dry-run result with a synthetic `wamid.sandbox.*` ID
- `normalizeWebhook()` parses real Meta webhook JSON without signature checks
- `healthCheck()` reports healthy with reason `sandbox (no WHATSAPP_ACCESS_TOKEN)`
- `discoverCapabilities()` reports `slaClass: SYNTHETIC`, `send_media: false`

## Production Deployment Checklist

### 1. Meta Business Setup
- [ ] Create a Meta Business account at [business.facebook.com](https://business.facebook.com)
- [ ] Create a WhatsApp Business App in the Meta Developer Portal
- [ ] Add a phone number and note the **Phone Number ID**
- [ ] Generate a permanent **System User Access Token** (not a short-lived user token)
- [ ] Copy the **App Secret** from the app dashboard

### 2. Webhook Configuration
- [ ] Set the webhook callback URL in the Meta dashboard to your platform's webhook endpoint
- [ ] Subscribe to the `messages` webhook field
- [ ] Verify the webhook URL using the verification token
- [ ] Ensure `WHATSAPP_APP_SECRET` is set for HMAC verification

### 3. Environment Configuration
```env
WHATSAPP_ACCESS_TOKEN=EAAGm0PX...
WHATSAPP_APP_SECRET=abc123...
WHATSAPP_PHONE_NUMBER_ID=1234567890
```

### 4. Verification
- [ ] Run integration tests: `pnpm vitest run test/whatsapp-meta.integration.test.ts`
- [ ] Send a test message via the adapter and confirm `wamid.*` response
- [ ] Send a WhatsApp message to the business number and verify webhook parsing
- [ ] Confirm HMAC signature verification rejects tampered payloads

### 5. Monitoring
- [ ] Monitor Graph API error rates (401 = token expired, 429 = rate limit)
- [ ] Track `retryable: true` results for transient failures
- [ ] Alert on `healthCheck()` returning `healthy: false`

## API Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `https://graph.facebook.com/v18.0/{phone-number-id}/messages` | Send outbound messages |
| GET | `https://graph.facebook.com/v18.0/debug_token` | Health check (token validity) |

## Error Handling

| HTTP Status | Category | Retryable | Action |
|---|---|---|---|
| 401/403 | AUTH | No | Check token validity |
| 429 | RATE_LIMIT | Yes (60s) | Back off and retry |
| 500/502/503/504 | TRANSIENT | Yes (5s) | Retry automatically |
| Other 4xx | VALIDATION | No | Check request payload |

## File Structure

```
packages/connectors/src/connectors/whatsapp-meta/
  index.ts          # Production adapter (Graph API + webhook verification)
packages/connectors/src/connectors/whatsapp-meta-sandbox/
  index.ts          # Sandbox adapter (unchanged, backward compatible)
packages/connectors/test/
  whatsapp-meta.integration.test.ts  # Integration tests
```
