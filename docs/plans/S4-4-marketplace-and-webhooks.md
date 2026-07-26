# S4-4: Connector SDK + Marketplace

> Status: ✅ COMPLETE  
> Created: 2026-07-21  
> Migration: `0016_marketplace_and_webhooks.sql`

## Overview

Stage 4 Workstream S4-4 (FUL-03) implements the platform ecosystem primitives:
a public integration marketplace and tenant-owned webhook subscriptions. This
enables third-party connectors to be discovered, installed, and configured by
tenants, with event-driven notifications via webhooks.

## Database Schema

Migration `0016_marketplace_and_webhooks.sql` creates four tables under RLS:

- `webhook_subscription` — tenant-owned webhook endpoints with signing secrets,
  event filters, and status (ACTIVE/PAUSED/DISABLED).
- `webhook_delivery` — immutable audit trail of delivery attempts with response
  status, retry count, and last attempt timestamp.
- `marketplace_listing` — public catalog of integrations (connectors, automations,
  analytics, channels) with provider ID, config schema, and published flag.
- `marketplace_installation` — tracks which listings a tenant has installed with
  tenant-specific config and status (ACTIVE/SUSPENDED/UNINSTALLED).

All tables enforce tenant isolation via RLS policies using `current_tenant_id()`.
Marketplace listings are cross-tenant readable (public catalog) but tenant-scoped
for writes.

## Domain Layer

No new domain package — the marketplace and webhook concepts are API-layer
primitives that delegate directly to the repository. Webhook signing uses
HMAC-SHA256 with a per-subscription secret (`whsec_` prefix).

## API Module

`apps/api/src/modules/marketplace/` exposes the marketplace and webhook APIs:

- `marketplace.repository.ts` — abstract `MarketplaceRepository` port plus
  `InMemoryMarketplaceRepository` (no-DB / tests) and `PostgresMarketplaceRepository`
  that delegates to the database via `withTenantTransaction`.
- `marketplace.controller.ts` — 11 endpoints across three resource groups.
- `marketplace.module.ts` — factory swap: picks Postgres when `DATABASE_URL` is
  bound, otherwise in-memory.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/marketplace/webhooks?tenantId=` | Create webhook subscription |
| GET | `/api/v1/marketplace/webhooks?tenantId=` | List webhooks for tenant |
| GET | `/api/v1/marketplace/webhooks/:id?tenantId=` | Get webhook by ID |
| PUT | `/api/v1/marketplace/webhooks/:id?tenantId=` | Update webhook (URL, events, status) |
| DELETE | `/api/v1/marketplace/webhooks/:id?tenantId=` | Delete webhook |
| GET | `/api/v1/marketplace/listings` | List published listings (public) |
| GET | `/api/v1/marketplace/listings/:id` | Get listing by ID |
| POST | `/api/v1/marketplace/listings` | Create listing (admin) |
| PUT | `/api/v1/marketplace/listings/:id` | Update listing (publish, version) |
| GET | `/api/v1/marketplace/installations?tenantId=` | List tenant installations |
| POST | `/api/v1/marketplace/installations?tenantId=` | Install a listing |
| PUT | `/api/v1/marketplace/installations/:listingId?tenantId=` | Update installation config |
| DELETE | `/api/v1/marketplace/installations/:listingId?tenantId=` | Uninstall listing |

## Webhook Flow

1. Tenant creates a webhook subscription via POST with `url`, `description`, and
   optional `events` filter (empty = all events).
2. System generates a signing secret (`whsec_` + UUID) and stores it with the
   subscription.
3. When a platform event occurs (order.created, payment.completed, etc.), the
   webhook dispatcher worker (future work) queries all ACTIVE subscriptions for
   the tenant, filters by event type, and delivers via HTTP POST with
   `X-Chai-Signature` header (HMAC-SHA256 of payload + secret).
4. Delivery attempts are logged to `webhook_delivery` with response status and
   retry count. Failed deliveries retry with exponential backoff (future work).

## Marketplace Flow

1. Admin creates a marketplace listing via POST with `providerId`, `name`,
   `description`, `category`, and `configSchema` (JSON Schema for tenant config).
2. Listing is initially unpublished (`published = false`).
3. Admin publishes via PUT with `published = true`.
4. Tenant browses published listings via GET `/listings` (public endpoint).
5. Tenant installs a listing via POST `/installations` with tenant-specific
   `config` (e.g., API keys, webhook URLs).
6. Installation is tracked in `marketplace_installation` with status ACTIVE.
7. Tenant can suspend or uninstall via PUT/DELETE.

## Testing

- `apps/api/test/integration/marketplace.integration.test.ts` — 14 test cases
  covering webhook CRUD, listing CRUD, installation lifecycle, tenant isolation,
  and error paths (not found, invalid transitions).

## Future Work

- Webhook delivery worker with retry logic and dead-letter queue
- Webhook signature verification helper in Connector SDK
- Marketplace listing versioning (multiple versions per provider)
- Installation health checks and auto-suspend on failure
- Analytics dashboard for webhook delivery success rate and latency
