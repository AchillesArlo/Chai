# Runbook — Provider / Webhook Outage

**Severity:** ticket or page by blast radius  
**Owner:** on-call platform + connector owner

## Detect

- Alert `WebhookIngestFailures` or `InboxQueueLag`
- Provider status page / sandbox failures
- Spike in `WEBHOOK_REJECTED` / unknown channel

## Contain

1. Confirm whether failure is signature, auth, rate limit, or total outage.
2. Keep inbox/outbox as source of truth — do not drop events.
3. If a single connector is toxic, disable that provider key only (kill switch).

## Recover

1. Drain backlog with bounded worker concurrency.
2. Replay from inbox leases; reclaim stale leases first.
3. Reconcile delivery status against provider after restore.
4. Verify no duplicate side effects (idempotency keys + external message ids).

## Verify

- Chaos e2e: `apps/api/test/chaos/duplicate-out-of-order.e2e.test.ts`
- Inbox/outbox integration tests under `packages/domain` and `workers/*`
