# Channel and Connector Specification

## 1. Connector Design

Every connector implements:

- identity and authorization;
- capability discovery;
- inbound verification/normalization;
- outbound action mapping;
- rate-limit handling;
- error normalization;
- idempotency/reconciliation;
- health;
- version/migration;
- audit metadata.

## 2. Capability Manifest

```json
{
  "connector_key": "whatsapp-meta",
  "version": "1",
  "capabilities": {
    "receive_text": true,
    "receive_media": true,
    "send_text": true,
    "send_media": true,
    "send_template": true,
    "delivery_status": true,
    "mark_read": true
  },
  "limits": {},
  "risk_class": "OFFICIAL",
  "sla_class": "PRODUCTION"
}
```

Capabilities are runtime/account-specific. UI and AI tools use effective capability intersection:

connector ∩ account scopes ∩ entitlement ∩ policy.

## 3. Canonical Connector Interface

Operations:

- connect/start authorization;
- complete authorization;
- refresh/rotate/revoke;
- discoverCapabilities;
- healthCheck;
- normalizeWebhook;
- sendMessage;
- sendTemplate;
- fetchMedia;
- markRead;
- query resource;
- execute mutation;
- reconcile action;
- disconnect.

Connector returns normalized:

- success/result;
- external ID;
- retryability;
- retry-after;
- error code/category;
- raw diagnostic reference;
- usage/cost metadata.

## 4. Error Taxonomy

| Category | Examples | Behavior |
|---|---|---|
| AUTH | expired/revoked token | Disable actions, alert |
| PERMISSION | missing scope | Capability downgrade |
| RATE_LIMIT | 429/quota | Retry-after/backoff |
| VALIDATION | bad payload | Non-retryable |
| NOT_FOUND | removed resource | Reconcile/local state |
| CONFLICT | version/state | Refresh and re-evaluate |
| TRANSIENT | timeout/5xx | Retry/circuit |
| POLICY | window/template/restricted | Block and explain |
| UNKNOWN_RESULT | timeout after submit | Reconcile before retry |

## 5. Webhook Requirements

- TLS.
- Provider challenge.
- Signature/timestamp verification.
- Body size limit.
- Replay prevention.
- Fast persist/ack.
- Inbox dedup.
- Raw payload restricted retention.
- Schema/version monitoring.
- Synthetic heartbeat if provider lacks health endpoint.

## 6. WhatsApp Provider Router

Modes:

- META_DIRECT;
- OFFICIAL_BSP;
- COMMUNITY_GATEWAY.

Domain modules never branch on provider mode. Channel adapter maps to canonical messages/actions.

### 6.1 Meta Direct

Platform owns:

- webhook;
- Graph API client;
- token references;
- template/window guard;
- message/status mapping;
- usage/cost attribution;
- Embedded Signup integration when available.

Production default.

Required states:

- CONNECTING;
- CONNECTED;
- DEGRADED;
- TOKEN_EXPIRED;
- DISABLED.

### 6.2 Official BSP

Adapter handles:

- BSP-specific auth/webhook;
- Meta/BSP account mapping;
- additional fees;
- capability differences;
- migration to/from Meta Direct where supported.

### 6.3 Community Gateway

Best-effort only.

Features:

- QR/pairing;
- encrypted session;
- reconnect;
- text/media;
- health states;
- internal webhook;
- conservative send rate;
- migration tooling.

Restrictions:

- Platform Owner activation only;
- informed client acceptance;
- no production channel SLA;
- no bulk unsolicited send;
- no anti-ban claim;
- separate deployment/failure domain;
- legal/policy kill switch.

## 7. Website Widget

### Capabilities

- text;
- approved media;
- typing/presence;
- customer info form;
- human handover;
- transcript;
- CSAT;
- optional verified identity.

### Security

- publishable widget key identifies config, not secret;
- allowed origins;
- signed short-lived session;
- bot/abuse rate limits;
- file scan;
- CSP and iframe isolation;
- no tenant secret in browser.

### Customization

- logo/name;
- brand tokens;
- welcome message;
- position;
- language;
- business hours;
- privacy/consent links.

## 8. Instagram

Target:

- DM receive/send;
- comments;
- public reply;
- private reply where supported;
- media;
- webhooks.

Requirements:

- professional/business account;
- app scopes/review;
- token refresh;
- comment/private reply policy windows;
- account capability discovery.

Never promise capability before app/account approval.

## 9. TikTok

Public developer products do not imply generic customer-service DM access.

Connector modes may include:

- approved Business API;
- TikTok Shop partner API;
- ads/lead messaging;
- comment operations where authorized.

Every capability is marked CONDITIONAL until actual app/market permission is verified.

## 10. Shopee

Target read-first:

- shop authorization;
- product/listing;
- stock;
- order;
- fulfillment;
- selected chat capability if authorized.

Write actions added only after:

- sandbox/partner approval;
- idempotency;
- source version;
- approval;
- reconciliation.

## 11. TikTok Shop

Target:

- seller authorization;
- product/listing;
- inventory;
- order/fulfillment.

Capability depends on market, app type, scopes, and review.

## 12. Google Calendar

OAuth per tenant/user/service account as permitted.

Operations:

- list resources/calendars;
- free/busy;
- create;
- reschedule;
- cancel;
- optional conference data;
- sync event status.

Rules:

- explicit timezone;
- recheck availability;
- idempotency;
- external event ID;
- token expiry alert;
- webhook/poll reconciliation.

## 13. CRM/Helpdesk

Canonical objects:

- contact;
- lead;
- ticket;
- owner;
- activity;
- stage/status.

Config:

- field mapping;
- direction;
- ownership;
- conflict policy;
- sync frequency;
- delete behavior.

Avoid bidirectional sync without explicit conflict resolution.

## 14. Commerce/ERP

Canonical mapping:

- product;
- SKU;
- listing;
- location;
- inventory;
- order;
- fulfillment;
- invoice/payment status.

Read cache includes source and observed_at. Write mutation always revalidates.

## 15. Payment Gateway

Model: bring the tenant’s own merchant/provider account. Funds settle according to the provider/client contract; the platform stores orchestration state and verified projections only.

Stage 0/1 operations:

- capability/account discovery;
- hosted payment link/session creation;
- payment-status query;
- expire/cancel where supported;
- webhook verification/normalization;
- reconciliation by external ID, idempotency key, or business reference;
- health/rate-limit observation.

Later capabilities:

- refund status/execution behind approval;
- recurring mandate/subscription;
- dispute and settlement reports.

Rules:

- hosted checkout; no raw card/CVV/PIN/OTP/bank-login fields;
- tenant + provider account + environment + external ID scopes uniqueness;
- amount/currency/business reference supplied by approved domain state;
- redirect/screenshot/customer claim does not set PAID;
- unknown submit result reconciled before retry;
- marketplace payment is read from marketplace when it owns the transaction;
- license/authorization, PCI scope, tax, settlement, and contract are validated per provider/client use case.

## 16. Shipping and Logistics

Provider modes:

- direct carrier API;
- shipping aggregator;
- client OMS/ERP/fulfillment provider;
- marketplace fulfillment API.

Stage 0/1 operations:

- link/import shipment;
- fetch shipment/tracking timeline;
- webhook verification/normalization;
- state-aware polling fallback;
- proof-of-delivery reference where supported;
- reconciliation/health.

Stage 2+ operations:

- rate quote;
- shipment/label purchase;
- pickup;
- cancellation;
- return and claim.

Each adapter ships a versioned provider-code → canonical-shipment-status mapping. Unknown codes map to UNKNOWN and alert; AI cannot infer them. ETA includes provider/source/freshness. Customer lookup requires tenant plus contact/order ownership, not a tracking number alone.

One order may map to multiple shipments and packages. Marketplace fulfillment remains authoritative when the marketplace owns label/carrier selection.

## 17. Authentication Storage

- OAuth access/refresh token in secret manager.
- Database stores credential reference and metadata.
- API key encrypted/vaulted.
- Token never returned to browser after exchange.
- Scope and expiry visible.
- Rotation/revocation audited.

## 18. Rate Limits

Connector maintains:

- provider/account limit state;
- per-tenant queue;
- Retry-After;
- concurrency;
- cost/volume quota.

Realtime customer service prioritized over sync/export.

Payment webhooks/status lookup and customer-requested tracking lookup are prioritized over bulk reconciliation/polling. Payment and logistics concurrency/rate state is isolated by tenant + provider account so one merchant/store cannot starve another.

## 19. Connector Certification

Before production:

- auth and refresh;
- scope discovery;
- webhook verify/replay/duplicate;
- pagination;
- rate limit;
- timeout/5xx;
- idempotency;
- unknown result reconciliation;
- media limits;
- PII/log redaction;
- tenant isolation;
- sandbox/live separation;
- disable/kill switch;
- runbook.

Additional payment certification:

- hosted-checkout boundary and prohibited-field tests;
- amount/currency/idempotency integrity;
- valid/invalid/rotated signature and out-of-order state;
- redirect vs verified-paid behavior;
- unknown-create-result and reconciliation mismatch;
- refund gate when enabled.

Additional logistics certification:

- status mapping version/unknown code;
- multiple parcels/partial fulfillment;
- webhook gap and poll fallback;
- guessed tracking reference/privacy;
- stale/exception detection and notification dedup;
- label/pickup/cancel/return unknown-result handling when enabled.

## 20. Connector Versioning

- Adapter version separate from provider API version.
- Breaking provider change creates new capability/version.
- Tenant instances report current version.
- Migration can be canary.
- Deprecation alert before cutoff.
- Raw provider fields never become required domain fields without ADR.
