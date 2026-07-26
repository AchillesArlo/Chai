# S4-1: Advanced Payments

## Overview

Stage 4 Workstream S4-1 (FUL-01) adds the advanced payment primitives that the
platform needs beyond one-shot checkouts: recurring subscriptions, refunds
against prior charges, and settlement reconciliation. It builds on the
`payment` table introduced in Stage 2 and the Midtrans adapter from S3-5.

The schema lives in `packages/database/migrations/0013_advanced_payments.sql`
and creates four tables under RLS:

- `subscription` — recurring billing plans with idempotent creation, period
  windows, and `ACTIVE / PAUSED / CANCELLED` status.
- `refund` — partial or full refunds against a `payment`, idempotent by
  `idempotency_key`, with `PENDING / COMPLETED / FAILED` status.
- `dispute` — chargeback tracking (`CHALLENGED / ACCEPTED / LOST`).
- `settlement` — provider settlement batches for reconciliation.

## Domain Layer

The domain functions live in `packages/domain/src/payments/` and are re-exported
from `@chai/domain` (no separate `advanced-payments` package — the payment
domain is the single home for all payment concepts to avoid duplication):

- `subscription.ts` — `createSubscription`, `renewSubscription`,
  `cancelSubscription`, `listSubscriptions`. Period math is centralized in
  `nextPeriodEnd` (MONTHLY = 30d, YEARLY = 365d); calendar drift is acceptable
  for billing scheduling, switch to date-fns if proration disputes arise.
- `refund.ts` — `processRefund` (idempotent, FOR UPDATE lock on the
  idempotency lookup), `getRefund`, `listRefundsForPayment`.
- `settlement.ts` — `listSettlements` with optional provider / date-range /
  limit filters. Tenant scoping comes from the RLS `current_tenant_id()`
  setting inside `withTenantTransaction`.
- `dispute.ts` — `createDispute`, `listDisputesForPayment`.

All functions take a `DatabaseTransaction` and rely on the tenant context set
by `withTenantTransaction`, so tenant isolation is enforced at the database
layer, not in application code.

## Connector Enhancements

The Midtrans adapter (`packages/connectors/src/connectors/midtrans/index.ts`)
gains two methods:

- `issueRefund(input)` — calls `POST /v2/{order_id}/refund/online` in live
  mode with `refund_key` idempotency. In mock mode it records the refund
  against the in-memory session so the conformance suite can exercise the
  flow without network access.
- `listSettlements(tenantId)` — calls the settlement report endpoint in live
  mode and filters to the tenant by parsing the `tenantId|externalId` order id
  convention. Mock mode returns an empty list (the reconciliation dashboard
  renders nothing in tests).

Both follow the existing `isLive()` / mock-fallback pattern used by
`createCheckoutSession` and `getSessionStatus`.

## API Module

`apps/api/src/modules/advanced-payments/` exposes the domain over the client
portal API, mirroring the Leads / Knowledge / Payments module factory swap:

- `advanced-payments.repository.ts` — abstract `AdvancedPaymentsRepository`
  port plus `InMemoryAdvancedPaymentsRepository` (no-DB / tests) and the
  `PostgresAdvancedPaymentsRepository` that delegates to the domain functions
  through `withTenantTransaction` with `SERVICE_PRINCIPAL_ID`.
- `advanced-payments.controller.ts` — four client-portal endpoints.
- `advanced-payments.module.ts` — factory swap: picks the Postgres repository
  when `DATABASE` is bound, otherwise the in-memory repository.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/client/v1/subscriptions` | Create a subscription (idempotent by `idempotencyKey`) |
| GET | `/api/client/v1/subscriptions?customerId=` | List subscriptions for the tenant, optionally filtered by customer |
| POST | `/api/client/v1/payments/:id/refunds` | Process a refund against payment `:id` |
| GET | `/api/client/v1/payments/settlements` | List settlement records for the tenant |

All endpoints carry `@RequireAudience('client-portal')` and resolve the tenant
from the request's `tenantContext`.

## Subscription Flow

1. Client POSTs to `/api/client/v1/subscriptions` with `planId`,
   `customerId`, `amountCents`, `currency`, `billingCycle`, and an
   `idempotencyKey`.
2. `createSubscription` inserts a row with `status = ACTIVE` and a period
   window of `[now, nextPeriodEnd(now, cycle)]`. The unique index on
   `(tenant_id, idempotency_key)` guarantees replay safety — a duplicate POST
   returns the original subscription.
3. Renewal extends the period window and flips `PAUSED` back to `ACTIVE`.
4. Cancellation sets `status = CANCELLED`; the row is retained for audit and
   reporting.

## Refund Process

1. Client POSTs to `/api/client/v1/payments/:id/refunds` with `amountCents`,
   `reason`, and `idempotencyKey`.
2. `processRefund` looks up an existing refund by `idempotency_key` first
   (FOR UPDATE) and returns it if present — duplicate refund requests are
   safe.
3. Otherwise it inserts a `PENDING` refund row referencing the payment. The
   Midtrans adapter's `issueRefund` is the provider-side call; its result
   populates `provider_ref` and drives the final status.
4. `GET /api/client/v1/payments/:id/refunds` (via the repository's
   `listRefundsForPayment`) surfaces the refund history for a payment.

## Settlement Reporting

1. The Midtrans adapter's `listSettlements(tenantId)` fetches the provider
   settlement report and filters to the tenant's order ids.
2. Each settlement row records `grossAmount`, `feeAmount`, `netAmount`, the
   provider reference, and `settledAt`.
3. The domain `listSettlements` function reads from the `chai.settlement`
   table (populated by the worker reconciliation job) under RLS, so the API
   only ever returns the caller's tenant settlements.

## Testing

- `apps/api/test/integration/advanced-payments.integration.test.ts` exercises
  subscription CRUD, idempotency, RLS isolation, and the refund flow against
  a testcontainers Postgres. The refund test first creates a payment through
  the existing `PostgresPaymentsRepository.createCheckout` so the FK on
  `chai.refund.payment_id` is satisfied.
- `packages/connectors/src/conformance/midtrans-advanced.test.ts` covers the
  refund + settlement adapter methods in both mock and live (faked-fetch)
  modes, including the failure path and the tenant-scoped settlement mapping.
