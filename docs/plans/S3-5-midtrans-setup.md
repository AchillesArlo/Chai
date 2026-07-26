# S3-5: Midtrans Payment Integration Setup

## Overview

Production-ready Midtrans Snap payment adapter with:
- Real Snap API checkout creation (`POST /snap/v1/transactions`)
- Transaction status polling (`GET /v2/{order_id}/status`)
- SHA-512 webhook signature verification (`order_id + status_code + gross_amount + server_key`)
- Automatic fallback to mock-payment behavior when no server key is set

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | Production | Server key from Midtrans dashboard, used for Basic auth and webhook signature verification |
| `MIDTRANS_CLIENT_KEY` | Production | Client key exposed to the frontend Snap.js tokenization |
| `MIDTRANS_SANDBOX` | Optional | `true` (default) selects sandbox URLs; `false` switches to production URLs |
| `MIDTRANS_SNAP_BASE_URL` | Optional | Override the Snap base URL (defaults to sandbox/production) |
| `MIDTRANS_STATUS_BASE_URL` | Optional | Override the core status base URL (defaults to sandbox/production) |

## Sandbox Setup (No Credentials)

When `MIDTRANS_SERVER_KEY` is unset, the adapter falls back to the mock-payment adapter:
- `createCheckoutSession()` returns a deterministic in-memory session with `status: PENDING`
- `getSessionStatus()` reads from the in-memory session map
- `handleWebhook()` accepts the mock signature `mock-payment-signature` and normalizes the payload
- `isLive()` returns `false` so callers can branch on real-vs-mock

This lets local dev and CI exercise the full payment flow without network calls.

## Midtrans Sandbox Account Setup

### 1. Register a Midtrans Sandbox Account
- [ ] Sign up at [https://dashboard.sandbox.midtrans.com/register](https://dashboard.sandbox.midtrans.com/register)
- [ ] Complete the merchant onboarding wizard
- [ ] Open **Settings > Access Keys**
- [ ] Copy the **Server Key** (`SB-Mid-server-...`) → set as `MIDTRANS_SERVER_KEY`
- [ ] Copy the **Client Key** (`SB-Mid-client-...`) → set as `MIDTRANS_CLIENT_KEY`

### 2. Test Cards (Sandbox)
- Visa success: `4811 1111 1111 1114` (CVV `123`, expiry any future date)
- Mastercard success: `5211 1111 1111 1117`
- Failure scenarios: see [Midtrans test cards](https://docs.midtrans.com/docs/testing-sandbox)

### 3. Adapter Wiring
```ts
import { createMidtransAdapter } from '@chai/connectors/midtrans';

const adapter = createMidtransAdapter({
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
  sandbox: process.env.MIDTRANS_SANDBOX !== 'false',
});

const session = await adapter.createCheckoutSession({
  amount: 99000,
  currency: 'IDR',
  idempotencyKey: crypto.randomUUID(),
  tenantId: 'tenant-a',
  metadata: {
    customerEmail: 'buyer@example.com',
    customerName: 'Buyer',
    finishUrl: 'https://shop.example/finish',
  },
});
// Redirect the user to session.redirectUrl
```

## Webhook Configuration

### 1. Expose a Webhook Endpoint
- [ ] Mount `POST /webhooks/midtrans` in your API (apps/api — out of scope for this adapter)
- [ ] Read the raw body as bytes (do NOT parse JSON before signature verification)
- [ ] Read the `X-Signature-Key` header (Midtrans sends the signature here, or compute from body fields)

### 2. Configure Midtrans Notification URL
- [ ] In the Midtrans dashboard: **Settings > Configuration > Payment Notification URL**
- [ ] Set to `https://api.yourdomain.com/webhooks/midtrans`
- [ ] Alternatively set per-transaction via `callbacks.notification_url` in the Snap request

### 3. Verify and Normalize
```ts
const raw = await req.text(); // raw body, do not parse first
const signatureKey = req.headers.get('x-signature-key') ?? undefined;
const { event, verified } = adapter.handleWebhook(raw, signatureKey);
if (!verified || !event) return res.status(401).end();
// event.status is one of: PENDING | PAID | EXPIRED | FAILED | UNKNOWN_RESULT
```

Signature formula (computed by the adapter):
```
SHA-512(order_id + status_code + gross_amount + server_key)
```

## Idempotency

- `createCheckoutSession` accepts an `idempotencyKey` and sends it as the `Idempotency-Key` header to Midtrans
- The adapter maintains an in-memory idempotency index within the process; replaying the same key returns the cached `externalId` instead of creating a duplicate Snap token
- Order IDs are namespaced as `{tenantId}|{externalId}` so webhooks route back to the correct tenant

## Production Promotion Checklist
- [ ] Set `MIDTRANS_SANDBOX=false`
- [ ] Rotate to production server/client keys (`Mid-server-...` / `Mid-client-...`)
- [ ] Verify webhook signature verification passes against a real Midtrans notification
- [ ] Enable Midtrans **Notification URL** retry policy (3 retries, exponential backoff)
- [ ] Confirm PCI scope: Snap.js handles card data on Midtrans-hosted pages; your server never sees PAN/CVV

## References
- [Midtrans Snap API](https://docs.midtrans.com/reference/snap-api-overview)
- [Midtrans HTTP Notifications](https://docs.midtrans.com/docs/https-notification-webhooks)
- [Midtrans Notification Signature Verification](https://docs.midtrans.com/reference/handle-notifications)
