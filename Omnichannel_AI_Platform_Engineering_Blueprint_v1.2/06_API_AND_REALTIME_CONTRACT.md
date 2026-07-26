# API and Realtime Contract

## 1. API Surfaces

| Surface | Base path | Audience |
|---|---|---|
| Owner API | /api/owner/v1 | PLATFORM_OWNER |
| Client API | /api/client/v1 | Tenant members |
| Widget API | /api/widget/v1 | End customer session |
| Provider webhooks | /webhooks/v1 | External providers |
| Connector callbacks | /callbacks/v1 | OAuth/provider callbacks |
| Internal service API | /internal/v1 | mTLS/service identity |

Never expose internal service routes through the public ingress.

## 2. Authentication and Context

### Owner

- OIDC session audience owner-console.
- MFA required.
- API token contains platform role, not arbitrary tenant.
- Tenant-specific operation includes tenant ID in path; server validates explicit owner context and audit reason for sensitive content.

### Client

- OIDC session audience client-portal.
- Access token identifies user.
- Tenant path/header is validated against membership.
- Client cannot request internal roles.

### Widget

- Short-lived signed conversation token.
- Origin/domain policy.
- Anonymous visitor identity rotates/merges only through verified flow.

### Service

- Workload identity/mTLS.
- Narrow service scope.
- Tenant context included in signed command and revalidated.

## 3. Request Standards

- Content-Type application/json unless upload handshake.
- Timestamps ISO 8601 UTC.
- Money minor_units + currency.
- Locale IETF language tag.
- Client-generated mutation request uses Idempotency-Key.
- Optimistic mutation uses If-Match or expected_version.
- Correlation ID accepted/generated and returned.
- Maximum page size 100; default 25.

Standard headers:

| Header | Direction | Purpose |
|---|---|---|
| Authorization | Request | Bearer/session |
| Idempotency-Key | Mutation request | Safe retry |
| If-Match | Mutation request | Expected resource version |
| X-Correlation-Id | Both | Trace |
| X-Request-Id | Response | Request identity |
| Retry-After | Response | Throttle/retry |

## 4. Response Envelope

Single resource:

```json
{
  "data": {
    "id": "uuid",
    "type": "conversation",
    "version": 12,
    "attributes": {}
  },
  "meta": {
    "request_id": "req_...",
    "freshness_at": "2026-07-14T09:00:00Z"
  }
}
```

Collection:

```json
{
  "data": [],
  "page": {
    "next_cursor": "opaque-or-null",
    "has_more": false
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

## 5. Error Contract

Use problem-details style:

```json
{
  "type": "https://docs.domain/errors/feature-not-enabled",
  "title": "Feature tidak aktif",
  "status": 403,
  "code": "FEATURE_NOT_ENABLED",
  "detail": "Calendar belum diaktifkan untuk tenant ini.",
  "request_id": "req_...",
  "correlation_id": "corr_...",
  "errors": []
}
```

Canonical codes:

| Code | HTTP | Meaning |
|---|---:|---|
| AUTHENTICATION_REQUIRED | 401 | Session/token absent or invalid |
| MFA_REQUIRED | 401 | Owner requires MFA |
| FORBIDDEN | 403 | Role lacks permission |
| TENANT_ACCESS_DENIED | 403/404 | No membership/scope |
| FEATURE_NOT_ENABLED | 403 | Entitlement disabled |
| RESOURCE_NOT_FOUND | 404 | Missing or intentionally hidden |
| VERSION_CONFLICT | 409 | Optimistic lock failure |
| IDEMPOTENCY_CONFLICT | 409 | Same key, different request |
| INVALID_STATE_TRANSITION | 409 | Domain state disallows action |
| VALIDATION_FAILED | 422 | Input invalid |
| APPROVAL_REQUIRED | 422 | Action needs approval |
| CHANNEL_WINDOW_CLOSED | 422 | Template/window requirement |
| RATE_LIMITED | 429 | Quota/provider limit |
| EXTERNAL_DEPENDENCY_FAILED | 502 | Connector/provider failure |
| TEMPORARILY_UNAVAILABLE | 503 | Retryable platform failure |

Do not disclose existence of another tenant resource.

## 6. Filtering and Sorting

- Query filters: filter[field]=value.
- Repeated values or comma-separated standardized per generated client.
- sort=-last_message_at,name.
- search=q for scoped full-text.
- Cursor opaque and bound to filter/sort.
- Date range uses from/to with explicit timezone interpretation in meta.

## 7. Owner API Endpoint Catalog

### Platform

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /platform/overview | Global health/cost/outcome |
| GET | /platform/alerts | Critical alerts |
| GET | /platform/settings | Guarded settings |
| PATCH | /platform/settings | Update guarded setting |

### Tenants

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /tenants | List/filter tenants |
| POST | /tenants | Create draft |
| GET | /tenants/:tenantId | Tenant detail |
| PATCH | /tenants/:tenantId | Update safe metadata |
| POST | /tenants/:tenantId/activate | Activate after gate |
| POST | /tenants/:tenantId/suspend | Suspend with reason |
| POST | /tenants/:tenantId/deletion-requests | Start deletion workflow |
| GET | /tenants/:tenantId/onboarding | Checklist |
| PATCH | /tenants/:tenantId/onboarding | Update checklist |

### Entitlements and memberships

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /tenants/:tenantId/entitlements | Read capabilities |
| PUT | /tenants/:tenantId/entitlements/:code | Set override |
| GET | /tenants/:tenantId/memberships | List client users |
| POST | /tenants/:tenantId/invitations | Invite Client Owner |
| DELETE | /tenants/:tenantId/memberships/:id | Revoke |

### Channels/connectors

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /channels | Cross-tenant health |
| POST | /tenants/:tenantId/channels | Create channel account |
| GET | /tenants/:tenantId/channels/:id | Detail |
| POST | /tenants/:tenantId/channels/:id/test | Test connection |
| POST | /tenants/:tenantId/channels/:id/disable | Disable |
| POST | /tenants/:tenantId/channels/:id/reconnect | Begin reconnect |
| POST | /tenants/:tenantId/channels/:id/migrations | Begin provider migration |
| POST | /tenants/:tenantId/connectors | Create connector |
| POST | /tenants/:tenantId/connectors/:id/oauth | Start OAuth |

### AI operations

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | /ai/providers | Provider config |
| POST | /ai/providers/:id/rotate | Rotate secret |
| GET/POST | /ai/deployments | Model deployment |
| GET/POST | /ai/aliases | Logical alias |
| GET/POST | /ai/routing-policies | Routing |
| POST | /ai/routing-policies/:id/publish | Publish |
| GET | /ai/evaluations | Evaluation runs |
| POST | /ai/evaluations | Start evaluation |
| POST | /ai/releases/:id/canary | Start canary |
| POST | /ai/releases/:id/rollback | Rollback |

### Operations

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /automation-runs | Cross-tenant runs |
| GET | /queues | Queue health |
| GET | /dead-letters | DLQ |
| POST | /dead-letters/:id/replay | Approved replay |
| GET/POST | /incidents | Incident operations |
| GET | /audit-events | Security/business audit |
| GET | /usage | Usage/cost |
| POST | /billing-exports | Async export |
| GET | /payment-operations | Cross-tenant provider/webhook/reconciliation health |
| GET | /shipment-operations | Cross-tenant provider/poll/exception health |
| POST | /tenants/:tenantId/payment-operations/:id/reconcile | Guarded payment reconciliation |
| POST | /tenants/:tenantId/shipment-operations/:id/reconcile | Guarded shipment reconciliation |

## 8. Client API Endpoint Catalog

### Session/tenant

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /me | Identity, memberships, permissions |
| GET | /tenants/:tenantId | Client-visible tenant |
| GET | /tenants/:tenantId/home | Home summary |
| GET | /tenants/:tenantId/entitlements | UI capability map |

### Conversations

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /tenants/:tenantId/conversations | List/filter |
| GET | /tenants/:tenantId/conversations/:id | Detail |
| GET | /tenants/:tenantId/conversations/:id/messages | Message cursor |
| POST | /tenants/:tenantId/conversations/:id/messages | Human outbound |
| POST | /tenants/:tenantId/conversations/:id/notes | Internal note |
| POST | /tenants/:tenantId/conversations/:id/takeover | Human takeover |
| POST | /tenants/:tenantId/conversations/:id/resume-ai | Resume AI |
| POST | /tenants/:tenantId/conversations/:id/assign | Assign |
| POST | /tenants/:tenantId/conversations/:id/resolve | Resolve |
| POST | /tenants/:tenantId/conversations/:id/reopen | Reopen |

Message mutation response is acceptance + message resource; provider delivery follows realtime/status polling.

### Attachments

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /tenants/:tenantId/uploads | Presigned upload handshake |
| POST | /tenants/:tenantId/uploads/:id/complete | Confirm checksum/scan workflow |
| GET | /tenants/:tenantId/attachments/:id/access | Short-lived access URL |

### Contacts/leads

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /tenants/:tenantId/contacts | Search/list |
| GET/PATCH | /tenants/:tenantId/contacts/:id | Detail/update |
| POST | /tenants/:tenantId/contact-merges | Preview/request merge |
| POST | /tenants/:tenantId/contact-merges/:id/execute | Execute |
| GET | /tenants/:tenantId/leads | List/pipeline |
| GET/PATCH | /tenants/:tenantId/leads/:id | Detail/update |
| POST | /tenants/:tenantId/leads/:id/stage-transitions | Change stage |
| POST | /tenants/:tenantId/leads/:id/assign | Assign |

### Knowledge

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | /tenants/:tenantId/knowledge-sources | List/create |
| GET/PATCH | /tenants/:tenantId/knowledge-sources/:id | Detail/config |
| POST | /tenants/:tenantId/knowledge-sources/:id/sync | Trigger sync |
| POST | /tenants/:tenantId/knowledge-sources/:id/test | Test query |
| POST | /tenants/:tenantId/knowledge-sources/:id/publish | Publish |
| POST | /tenants/:tenantId/knowledge-sources/:id/rollback | Rollback |

### Calendar

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /tenants/:tenantId/calendar/resources | Resources |
| POST | /tenants/:tenantId/calendar/availability-queries | Query slots |
| GET/POST | /tenants/:tenantId/appointments | List/create |
| GET | /tenants/:tenantId/appointments/:id | Detail |
| POST | /tenants/:tenantId/appointments/:id/reschedule | Reschedule |
| POST | /tenants/:tenantId/appointments/:id/cancel | Cancel |
| POST | /tenants/:tenantId/appointments/:id/outcomes | Complete/no-show |

### Payments

Routes exist only when the tenant has `payment_orchestration` entitlement.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /tenants/:tenantId/payment-provider-accounts | Capability/health metadata; never plaintext secret |
| GET/POST | /tenants/:tenantId/payment-requests | List/create draft or policy-approved request |
| GET | /tenants/:tenantId/payment-requests/:id | Request, attempts, timeline, linked objects, reconciliation |
| POST | /tenants/:tenantId/payment-requests/:id/payment-links | Create/refresh hosted link if eligible |
| POST | /tenants/:tenantId/payment-requests/:id/cancel | Guarded cancel/expire |
| POST | /tenants/:tenantId/payment-requests/:id/reconcile | Authenticated provider refresh |
| POST | /tenants/:tenantId/payment-requests/:id/refund-requests | Create high-risk approval request; post-MVP |

The API never accepts card number, CVV, PIN, OTP, or bank-login fields. Amount/currency use minor units and an authoritative business reference/version. A mutation returning `accepted/processing` is not a paid result.

### Shipments

Routes exist only when the tenant has `shipment_tracking` or later logistics entitlements.

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | /tenants/:tenantId/shipments | List or link/import a shipment |
| GET | /tenants/:tenantId/shipments/:id | Shipment/packages/items/tracking timeline |
| POST | /tenants/:tenantId/shipments/:id/reconcile | Provider tracking refresh |
| GET | /tenants/:tenantId/shipments/:id/proof-of-delivery | Guarded short-lived artifact reference |
| GET | /tenants/:tenantId/shipment-exceptions | Filter actionable exceptions |
| POST | /tenants/:tenantId/shipment-exceptions/:id/resolve | Resolve with reason/version |
| POST | /tenants/:tenantId/shipments/:id/return-requests | High-risk return request; post-MVP |

End-customer channel tools do not expose these routes directly. They use internal scoped actions after contact/order verification.

### Automations/analytics/team/settings

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /tenants/:tenantId/automations | Enabled templates |
| PATCH | /tenants/:tenantId/automations/:id | Safe parameters/pause |
| GET | /tenants/:tenantId/automation-runs | Run history |
| GET | /tenants/:tenantId/analytics/:dashboard | Metrics |
| POST | /tenants/:tenantId/exports | Async export |
| GET | /tenants/:tenantId/memberships | Team |
| POST | /tenants/:tenantId/invitations | Invite |
| PATCH | /tenants/:tenantId/memberships/:id | Role/queue |
| GET/PATCH | /tenants/:tenantId/settings/:section | Scoped settings |

## 9. Widget API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /sessions | Create signed widget session |
| POST | /sessions/:id/messages | Send inbound |
| GET | /sessions/:id/messages | Poll/fallback |
| POST | /sessions/:id/uploads | Upload handshake |
| POST | /sessions/:id/identity-verifications | Optional identity merge |
| POST | /sessions/:id/handover | Request human |

Widget session is origin-bound, rate-limited, and tenant-resolved through published widget config.

## 10. Webhook Contract

Public route identifies configured subscription through opaque key, not raw tenant ID.

Processing:

1. Validate HTTP method/content.
2. Verify provider challenge/signature/timestamp.
3. Resolve channel account.
   For payment/logistics providers, resolve the opaque webhook subscription to exactly one tenant-owned provider account.
4. Enforce max body and replay window.
5. Persist inbox event.
6. Return provider-required acknowledgement.

Never perform model/connector action before acknowledgement.

Provider-specific additions:

- retain verification key/version and provider occurred time;
- deduplicate by tenant + provider account + external event identity;
- quarantine unknown schema/status without guessing;
- webhook absence or weak signing support triggers authenticated polling/reconciliation controls;
- redirect/callback from a customer browser never changes payment to PAID without provider verification.

## 11. Realtime Contract

Connection:

- token or authenticated cookie;
- tenant and permissions resolved server-side;
- heartbeat;
- reconnect with last_event_id.

Channels:

- tenant summary;
- queue;
- conversation;
- user notifications;
- owner platform health.

Canonical client events:

| Event | Payload minimum |
|---|---|
| conversation.created | conversation summary |
| conversation.updated | id, version, changed fields |
| message.created | message resource |
| message.status_changed | id, status, timestamps/error |
| conversation.assignment_changed | id, assignee, queue, version |
| conversation.mode_changed | id, AI/HUMAN/PAUSED |
| lead.updated | id, stage, score, owner, version |
| appointment.updated | id, status, starts_at, version |
| payment.updated | id, status, amount/currency, verified_at, reconciliation_state, version |
| shipment.updated | id, status, last_event_at, eta_source/freshness, version |
| shipment.exception_opened | exception id, shipment id, type, severity, owner, version |
| notification.created | notification |
| channel.health_changed | account, status, reason |
| export.ready | export id, expiry |

Client applies event only if version is newer; otherwise refetch.

Presence/typing:

- ephemeral;
- never included in audit/business history;
- tenant/conversation scoped;
- expires automatically.

## 12. Permission Contract

API returns effective permissions in session bootstrap:

- resource.action strings;
- entitlement flags;
- data masking hints.
- risk/approval hints for payment and logistics actions;
- provider freshness/reconciliation metadata for externally sourced states.

Frontend may use them for UX, but backend authorization remains authoritative.

## 13. Audit Contract

Mutation controller/service supplies:

- actor;
- tenant;
- action;
- object;
- reason for guarded action;
- before/after fields or diff reference;
- correlation ID.

Read audit required for:

- owner viewing tenant conversation content;
- secret metadata;
- exports;
- restricted PII;
- security/audit pages.

## 14. API Compatibility

- Additive response fields are backward compatible.
- Removing/renaming fields requires version.
- Enum consumers must handle UNKNOWN.
- Event schemas carry version.
- Deprecation warning and sunset date at least one supported release window.
- Generated clients pinned to contract version.

## 15. Contract Acceptance

- OpenAPI generated/validated in CI.
- All endpoint examples pass schema validation.
- Permission tests cover each route.
- Wrong-tenant resource returns no data.
- Idempotency tests cover retries/concurrency.
- Realtime reconnect and duplicate events tested.
- Owner/client audiences cannot be exchanged.
- Prohibited payment credential fields are rejected and redacted from error/log fixtures.
- Payment and shipment duplicate/out-of-order webhook contract tests preserve one logical state transition.
- Uncertain provider mutation returns a reconciling state and cannot be blindly repeated with a new key.
- Tracking/proof endpoints enforce contact/order ownership or tenant role and never authorize by guessed tracking number alone.
