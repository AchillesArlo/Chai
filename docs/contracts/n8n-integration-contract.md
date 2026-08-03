# n8n Integration Contract

> Status: normative contract. Closes **REQ-07-012**.
> Source of truth: `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/07_EVENTS_AUTOMATIONS_AND_JOBS.md` §13 ("n8n Contract"), with §11.4 (Export) and §12 (Temporal Adoption Boundary) as adjacent context.

This document defines how the platform integrates with **n8n** as an *optional, per-tenant, low-risk* automation extension. It is a contract, not code: it fixes the payload shapes, the authentication scheme, and — most importantly — the hard boundaries n8n must never cross. Any n8n workflow that violates a boundary below is a release bug, not a configuration choice.

## 1. Role of n8n

n8n is an **outer** integration surface. It lets a tenant glue platform events to third-party SaaS and back-office notifications without shipping a bespoke connector. It is explicitly **not** part of the trusted core:

- It never holds authorization.
- It never holds conversation, customer, payment, or shipment state.
- It never executes an irreversible business effect on its own authority.

The trusted core (`apps/api` policy engine, the durable `chai.workflow_run` claim-loop, the connectors, and the outbox) remains the single source of truth. n8n consumes signed facts and *requests* effects back through the same guarded paths any other caller uses.

## 2. Transport & authentication

Two directions, both authenticated, neither trusting the other implicitly.

### 2.1 Platform → n8n (event delivery)

- The platform delivers a **signed event** over HTTPS POST to a tenant-configured n8n webhook URL, **or** n8n polls a read-only platform integration API. Delivery is at-least-once; n8n must deduplicate by `eventId`.
- Every delivered body carries an **HMAC-SHA256 signature** over the raw request body using a per-tenant shared secret, in an `X-Chai-Signature` header (`sha256=<hex>`), plus an `X-Chai-Timestamp` header. n8n must reject a body whose signature does not verify or whose timestamp is outside a small skew window (replay guard).
- The signing secret is a platform-managed secret reference; it is **never** embedded in workflow static data (see §4).

**Delivered event body:**

```json
{
  "eventId": "uuid",
  "eventType": "payment.paid",
  "occurredAt": "2026-07-31T12:00:00.000Z",
  "schemaVersion": 1,
  "tenantId": "uuid",
  "riskClass": "OFFICIAL",
  "payload": { "__note": "sanitized projection — no secrets, no full PII, no proof artifacts" }
}
```

The `payload` is a **sanitized projection**: it carries business references (ids, amounts as integer minor units + currency code, canonical status), never raw secrets, never full addresses, never proof-of-delivery artifacts, never provider credentials.

### 2.2 n8n → Platform (callback / requested effect)

When an n8n workflow wants the platform to *do* something, it calls back. The callback is **signed the same way** (HMAC over body, per-tenant secret) and is subject to the full guard order (Audience → Authorization → Entitlement) and idempotency on arrival — n8n is just another untrusted caller.

**Callback body (per blueprint §13 — "workflow/run ID, tenant, action ID, status, sanitized result, and signature"):**

```json
{
  "workflowId": "n8n-workflow-id",
  "runId": "n8n-run-id",
  "tenantId": "uuid",
  "actionId": "uuid",
  "status": "SUCCEEDED",
  "result": { "__note": "sanitized — no secrets, no proof artifacts, no invented statuses" }
}
```

- Any effect with a real-world side effect (refund, payout, label purchase, pickup, cancellation, return, message send) must be expressed as an **ActionRequest** carrying an `actionId` idempotency key and must pass the policy engine. n8n cannot bypass the `chai.action_request` idempotent-execution path. A retried callback with the same `actionId` returns the recorded outcome, never a second execution.
- Status vocabulary is the platform's canonical enum. An n8n-reported status the platform cannot classify is treated as `UNKNOWN` and reconciled, never guessed into a terminal state.

## 3. Allowed uses (blueprint §13)

- Client-specific data **transform**.
- **Low-risk SaaS action** (e.g. append a row to a sheet, post to a project tool).
- **Prototype connector** — a throwaway integration before a first-class connector exists.
- **Back-office notification** (e.g. notify an internal ops channel).

## 4. Forbidden — hard boundaries (blueprint §13)

n8n **must never**:

1. Make a **tenant authorization decision**. Authorization lives only in the platform guard order.
2. Receive **raw secret propagation**. Secrets are referenced and resolved inside the trusted core, never handed to n8n.
3. Act as the **source of truth for customers or conversations**. It holds no conversation state.
4. Own or override the **global AI tool policy**. The policy engine is the only grantor of AI tool side effects.
5. **Store state in workflow static data** — no conversation state, no payment/shipping credentials, no full address, no proof-of-delivery artifact may be persisted in an n8n workflow's static data.
6. Perform an **irreversible action without platform approval**. Irreversible effects go through a signed ActionRequest + reconciliation, never n8n acting alone.
7. Accept a **redirect, screenshot, or customer claim as payment proof**, or **invent a shipment status/ETA**. Payment truth comes only from a verified provider event/query; shipment truth comes only from canonical provider events.
8. Directly execute a **refund, payout, label, pickup, cancellation, or return** outside a signed ActionRequest and reconciliation contract.

## 5. Why these boundaries (invariant tie-in)

These are direct consequences of the platform invariants (`README.md` §"Invarian"):

- **Policy engine is the only grantor of tool side effects** → boundaries 1, 4, 6, 8.
- **External effects must be idempotent and reconcilable; business mutation + audit + event commit in one transaction** → the ActionRequest requirement in §2.2 and boundaries 6, 7, 8.
- **`PAID` never regresses; unknown provider codes become `UNKNOWN`** → boundary 7 and the status handling in §2.2.
- **Tenant isolation** → per-tenant secrets and per-tenant webhook configuration in §2; n8n never sees cross-tenant data.
- **Money is always integer minor units + currency code** → the payload rule in §2.1.

## 6. Relationship to `chai.workflow_run`

n8n is **not** a durable-workflow engine and does not replace `chai.workflow_run`. Durable, compensating, reconcilable workflows (booking, payment collection, shipment tracking) run on the platform's own claim-loop substrate (`chai.workflow_run` + `FOR UPDATE SKIP LOCKED`, per `docs/plans/2026-07-27-deferred-workers-roadmap.md` §2). n8n may be *notified* of a workflow milestone via a signed event, and may *request* a guarded effect via a signed callback, but the durable state and its compensation always live in the platform, never in n8n.
