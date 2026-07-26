# S3-5: JNE Logistics Integration Setup

## Overview

Production-ready JNE shipping adapter with:
- Shipment booking (`POST /tracing/api/v1/create`)
- AWB tracking (`POST /tracing/api/v1/trace`)
- Tracking webhook normalization into the canonical milestone timeline
- Automatic fallback to mock-shipping behavior when no API key is set

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JNE_API_KEY` | Production | API key issued by JNE for the OlShop / tracing API |
| `JNE_USERNAME` | Production | Username (often the JNE customer/merchant code) sent with each request |
| `JNE_ORIGIN` | Optional | Default origin branch code (e.g. `CGK10000` for Jakarta); overridable per booking |
| `JNE_TRACE_BASE_URL` | Optional | Override the trace API base URL (defaults to `https://apiv2.jne.co.id:10101/tracing/api/v1/trace`) |

## Sandbox Setup (No Credentials)

When `JNE_API_KEY` is unset, the adapter falls back to the mock-shipping adapter:
- `createShipment()` links a tracking record in-memory and returns a `LINKED` milestone
- `trackShipment()` reads from the in-memory shipment map
- `handleWebhook()` accepts payloads without signature verification and normalizes them
- `isLive()` returns `false` so callers can branch on real-vs-mock

This lets local dev and CI exercise the full shipping flow without network calls.

## JNE API Registration

### 1. Obtain JNE API Access
- [ ] Open a JNE corporate account at a JNE branch or [https://www.jne.co.id](https://www.jne.co.id)
- [ ] Request access to the **JNE OlShop API** (e-commerce/olshop integration)
- [ ] JNE issues an **API Key** and **Username** (customer code); store both as secrets
- [ ] Confirm the origin branch code(s) you ship from (e.g. `CGK10000`, `BDO10000`, `SUB10000`)

### 2. Service Codes
Common JNE service codes used in `booking.service`:
| Code | Service |
|---|---|
| `REG` | Regular (2-3 days) |
| `YES` | Yakin Esok Sampai (next-day) |
| `OKE` | Economy |
| `SPS` | Prioritas Same Day |
| `CTC` / `CTCYES` | City-to-City |

### 3. Adapter Wiring
```ts
import { createJneAdapter } from '@chai/connectors/jne';

const adapter = createJneAdapter({
  apiKey: process.env.JNE_API_KEY,
  username: process.env.JNE_USERNAME,
  origin: process.env.JNE_ORIGIN ?? 'CGK10000',
});

const shipment = await adapter.createShipment({
  consigneeCity: 'Bandung',
  consigneeName: 'Buyer',
  consigneePhone: '0812xxxxxxx',
  destinationZip: '40111',
  idempotencyKey: crypto.randomUUID(),
  items: [{ qty: 2, weight: 750 }], // weight in grams
  service: 'REG',
  shipperName: 'Seller Co',
  tenantId: 'tenant-a',
});
// shipment.trackingNumber is the JNE cnote number
```

## Webhook Configuration

### 1. Expose a Tracking Webhook Endpoint
- [ ] Mount `POST /webhooks/jne` in your API (apps/api — out of scope for this adapter)
- [ ] JNE pushes tracking status updates as JSON; the body carries `cnote_no` / `status` / `date` / `desc`
- [ ] Read the JSON body and pass the parsed object to `handleWebhook`

### 2. Configure JNE Webhook
- [ ] Coordinate with your JNE integration contact to register your callback URL
- [ ] Set the callback to `https://api.yourdomain.com/webhooks/jne`
- [ ] JNE does not sign webhooks by default; verify the source IP against the JNE egress range if available
- [ ] Alternatively, rely on scheduled `trackShipment` polling as the source of truth and treat webhooks as a freshness hint

### 3. Normalize and Store
```ts
const payload = await req.json();
const { record, verified } = adapter.handleWebhook(payload);
if (!verified || !record) return res.status(400).end();
// record.status is one of: LINKED | PICKED_UP | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | EXCEPTION | STALE
// record.events is the append-only, chronologically sorted milestone timeline
```

## Milestone Mapping

JNE status codes are normalized to the canonical `ShipmentMilestone` set:

| JNE Status | Canonical Milestone |
|---|---|
| `ACCEPTANCE`, `MANIFEST`, `RECEIVED` | `LINKED` / `PICKED_UP` |
| `DEPARTED`, `TRANSIT`, `IN_TRANSIT`, `ARRIVED` | `IN_TRANSIT` |
| `ON_DELIVERY`, `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` |
| `DELIVERED`, `POD` | `DELIVERED` |
| `REJECTED`, `RETURN`, `CANCEL`, `EXCEPTION` | `EXCEPTION` |
| unknown codes | `IN_TRANSIT` (safe default) |

Out-of-order provider events are re-sorted by timestamp before storage so the timeline is always chronological.

## Idempotency
- `createShipment` accepts an `idempotencyKey` and sends it as the `Idempotency-Key` header and the `id` body field
- Replaying the same key reuses the cached booking and tracking number

## Production Promotion Checklist
- [ ] Set `JNE_API_KEY` and `JNE_USERNAME` from secrets manager
- [ ] Confirm the origin branch code matches your fulfillment warehouse
- [ ] Validate rate limits with JNE (default ~10 req/s for trace); add a queue if you poll in bulk
- [ ] Wire `trackShipment` as a scheduled job (e.g. every 15 min) so missed webhooks self-heal
- [ ] Set the `STALE` milestone after 48h without an update (mock-shipping already models this)

## References
- [JNE OlShop API (partner portal)](https://apidash.jne.co.id)
- JNE tracing base: `https://apiv2.jne.co.id:10101/tracing/api/v1/trace`
