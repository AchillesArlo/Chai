# Events, Automations, and Job Processing

## 1. Event Principles

- Events describe facts in past tense.
- Commands request an action in imperative form.
- Every event is tenant-scoped where applicable.
- Event payload is minimal and references large/sensitive data.
- Schema versions are explicit.
- Consumers are idempotent.
- Ordering is guaranteed only within documented partition key.
- Database outbox is authoritative until publication succeeds.

## 2. Canonical Envelope

```json
{
  "event_id": "uuid",
  "event_type": "message.received",
  "schema_version": 1,
  "tenant_id": "uuid",
  "aggregate": {
    "type": "conversation",
    "id": "uuid",
    "version": 12
  },
  "occurred_at": "2026-07-14T09:00:00Z",
  "published_at": "2026-07-14T09:00:01Z",
  "correlation_id": "corr_...",
  "causation_id": "event-or-command-id",
  "actor": {
    "type": "customer|user|service|ai",
    "id": "opaque"
  },
  "data": {}
}
```

Sensitive raw provider payload is stored by reference with shorter retention.

## 3. Event Catalog

### 3.1 Tenancy/IAM

- tenant.created
- tenant.activated
- tenant.suspended
- tenant.deletion_requested
- membership.invited
- membership.activated
- membership.revoked
- entitlement.changed
- privileged_access.granted
- privileged_access.revoked

### 3.2 Channel

- channel_account.created
- channel_account.connected
- channel_account.degraded
- channel_account.reauth_required
- channel_account.blocked
- channel_account.disabled
- channel_account.provider_migration_started
- channel_account.provider_migration_completed
- provider_webhook.received
- outbound_message.accepted
- outbound_message.delivered
- outbound_message.failed

### 3.3 Contact/conversation

- contact.created
- contact.updated
- contact.merged
- contact.unmerged
- contact.opted_out
- conversation.opened
- message.received
- message.created
- message.status_changed
- conversation.assigned
- conversation.mode_changed
- conversation.resolved
- conversation.reopened
- conversation.sla_breached

### 3.4 AI/knowledge

- agent_release.published
- model_routing.changed
- ai_generation.completed
- ai_generation.failed
- ai_fallback.used
- ai_handover.requested
- tool_action.proposed
- tool_action.confirmed
- tool_action.approved
- tool_action.succeeded
- tool_action.failed
- knowledge_sync.started
- knowledge_document.processed
- knowledge_version.published
- knowledge_version.failed
- knowledge_freshness.overdue

### 3.5 Sales/calendar/commerce

- lead.created
- lead.qualified
- lead.stage_changed
- lead.assigned
- lead.converted
- appointment.created
- appointment.rescheduled
- appointment.cancelled
- appointment.completed
- appointment.no_show
- inventory.observed
- order.synced
- invoice.created
- payment_request.created
- payment_link.created
- payment.status_changed
- payment.paid
- payment.expired
- payment.failed
- payment.reconciliation_mismatch
- refund.requested
- refund.status_changed
- shipment.created
- shipment.linked
- shipment.tracking_event_recorded
- shipment.status_changed
- shipment.delivered
- shipment.stale_detected
- shipment.exception_opened
- shipment.exception_resolved
- return.status_changed

### 3.6 Automation/operations

- automation_run.started
- automation_run.waiting
- automation_run.step_completed
- automation_run.stopped
- automation_run.failed
- export.requested
- export.ready
- export.expired
- incident.created
- incident.resolved

## 4. Command Catalog

- ProcessInboundMessage
- RouteConversation
- GenerateAgentResponse
- ExecuteToolAction
- SendChannelMessage
- AssignConversation
- StartHumanTakeover
- ResumeAI
- ResolveConversation
- QualifyLead
- QueryAvailability
- CreateAppointment
- RescheduleAppointment
- CancelAppointment
- ScheduleFollowUp
- StopFollowUp
- SyncKnowledgeSource
- PublishKnowledgeVersion
- SyncCommerceObject
- CreatePaymentRequest
- CreatePaymentLink
- CancelPaymentRequest
- ReconcilePayment
- RequestRefund
- LinkShipment
- RefreshShipmentTracking
- CreateShipment
- SchedulePickup
- CancelShipment
- CreateReturnShipment
- ResolveShipmentException
- GenerateExport
- ReconcileUsage
- MigrateChannelProvider
- ExecuteRetentionPolicy

Commands include command_id, tenant, actor, idempotency key, expected version, and trace.

## 5. Queue Topology

| Queue | Priority | Ordering key | Retry |
|---|---:|---|---|
| realtime-channel | Highest | channel account / conversation | Fast bounded |
| realtime-domain | Highest | conversation | Fast bounded |
| realtime-ai | High | conversation turn | Provider-aware |
| connector | High | connector + resource | Rate-limit aware |
| payment-webhook | Highest | provider account + external event | Fast bounded/deduplicated |
| payment-command | High | payment request/business reference | Reconcile unknown result |
| payment-reconciliation | Normal | provider account + payment request | Rate-limit/age aware |
| logistics-webhook | High | provider account + shipment | Fast bounded/deduplicated |
| logistics-command | High | shipment/order | Reconcile unknown result |
| logistics-poll | Normal | provider account + shipment | State/rate-limit aware |
| automation | Normal | workflow run | Durable |
| media | Normal | attachment | Resource-aware |
| analytics | Low | tenant/time partition | Batch |
| export | Low | export job | Bounded |
| maintenance | Low | job type/tenant | Scheduled |
| dead-letter | Manual | original key | No auto retry |

## 6. Retry Policy

### Retryable

- network timeout;
- 429/rate limit;
- temporary 5xx;
- worker crash;
- lease timeout;
- temporary provider unavailable.

### Non-retryable without correction

- invalid auth/revoked token;
- validation/schema failure;
- forbidden capability;
- channel policy violation;
- unsupported media;
- invalid state transition;
- permanent 4xx.

Default:

- exponential backoff;
- jitter;
- max attempts by action risk;
- respect Retry-After;
- circuit breaker after threshold;
- DLQ with sanitized diagnostic.

Uncertain side effect must reconcile before retry.

## 7. Inbox Pattern

Webhook handling transaction:

1. Resolve provider/subscription.
2. Verify.
3. Compute provider event key/hash.
4. Insert inbox_event with unique key.
5. Duplicate returns prior acknowledgement.
6. New event scheduled for worker.

Inbox statuses:

- RECEIVED;
- PROCESSING;
- PROCESSED;
- RETRY_WAIT;
- DEAD_LETTER;
- IGNORED.

## 8. Outbox Pattern

Domain transaction:

1. Validate tenant, permission, state.
2. Mutate aggregate.
3. Append audit.
4. Append outbox event.
5. Commit.

Publisher:

- claims available rows;
- publishes/enqueues;
- marks published;
- retries safely;
- monitors oldest unpublished age.

## 9. Automation Definition Model

Immutable version contains:

- trigger;
- filters;
- conditions;
- steps;
- delays;
- business timezone;
- consent/channel policy;
- stop rules;
- retry/timeout;
- approval;
- output metrics.

Definition lifecycle:

DRAFT → VALIDATED → PUBLISHED → DEPRECATED.

Running workflow remains pinned to its version unless explicit migration exists.

## 10. MVP Automation Templates

### 10.1 No-response follow-up

Trigger: lead conversation waiting.

Conditions:

- consent valid;
- lead not closed;
- no customer reply;
- channel connected;
- within permitted send policy.

Steps:

1. Wait configurable duration.
2. Re-evaluate stop rules.
3. Choose approved template/message.
4. Send.
5. Wait.
6. Optionally repeat within max count.

Stop reasons persisted:

- CUSTOMER_REPLIED;
- OPT_OUT;
- LEAD_CLOSED;
- BOOKING_CREATED;
- CHANNEL_UNAVAILABLE;
- WINDOW_POLICY_BLOCKED;
- MAX_ATTEMPTS;
- MANUAL_STOP.

### 10.2 Booking reminder

- Trigger appointment confirmed.
- Schedule relative reminders.
- Recheck status before send.
- Customer reply can branch to reschedule/handover.

### 10.3 Hot lead notification

- Trigger lead qualified.
- If score/rules meet threshold, assign/alert.
- Deduplicate by lead + score version + stage.

### 10.4 Knowledge freshness

- Trigger next_review_at.
- Notify owner/manager.
- Mark source stale after grace period.
- Optional restrict AI use after expiry.

### 10.5 Payment request/reminder

- Trigger approved invoice/order/booking deposit.
- Create one hosted link using business reference + idempotency key.
- Send amount/currency/purpose/merchant/expiry summary.
- Before each reminder, reconcile status and re-evaluate consent/channel window.
- Stop on PAID, EXPIRED, CANCELLED, customer reply, opt-out, order/booking cancellation, or manual stop.
- Redirect/screenshot/customer claim does not trigger paid branch.

### 10.6 Shipment milestone and exception

- Trigger canonical status transition, not every duplicate provider scan.
- Send only tenant-configured milestones with consent/channel policy and dedup key.
- Stop normal polling after DELIVERED/RETURNED/CANCELLED according to policy.
- Open exception on stale, delivery failed, address issue, lost, damaged, customs hold, or returning state.
- Assign/alert client team and optionally open/handover conversation.

## 11. Durable Workflows

### 11.1 Booking

States:

- REQUESTED;
- AVAILABILITY_OFFERED;
- CUSTOMER_CONFIRMED;
- CREATING;
- CONFIRMED;
- RESCHEDULING;
- CANCELLED;
- FAILED_REVIEW.

Compensation:

- if calendar created but local commit fails, reconcile/import;
- if local confirmed but external missing, alert and repair;
- never silently create second event.

### 11.2 Channel provider migration

States:

- PRECHECK;
- OUTBOUND_PAUSED;
- QUEUE_DRAINING;
- TARGET_ONBOARDING;
- TARGET_TESTING;
- SWITCHING;
- OBSERVING;
- COMPLETED or ROLLED_BACK.

### 11.3 Data deletion

- Verify request/authorization.
- Freeze or identify legal hold.
- Export if required.
- Delete/aggregate by data store.
- revoke session/identity;
- write completion certificate/audit;
- tolerate retries without duplicate external action.

### 11.4 Export

- Snapshot filter/permission.
- Queue generation.
- Stream encrypted artifact to object storage.
- Provide short-lived link.
- Expire/delete artifact.

### 11.5 Payment collection and reconciliation

States:

- DRAFT;
- PENDING_CUSTOMER;
- PROCESSING;
- PAID;
- EXPIRED;
- FAILED;
- CANCELLED;
- REFUND_PENDING/PARTIALLY_REFUNDED/REFUNDED/DISPUTED when enabled.

Workflow requirements:

- amount/currency/business reference locked before provider attempt;
- unknown submit result signals reconciliation rather than immediate retry;
- verified provider event/query drives status;
- late/out-of-order event cannot regress paid state without explicit reversal;
- `payment.paid` updates linked projections and stops reminders exactly once;
- mismatch creates operational exception with owner/age/SLA.

### 11.6 Shipment tracking and return

The workflow consumes immutable provider events and state-aware polling. It supports multiple shipments/packages per order, milestone deduplication, stale detection, exception assignment, proof-of-delivery reference, and later return relation.

Mutation compensation:

- if provider created shipment/label but local commit failed, reconcile/import the external resource;
- if local state says created but provider has no resource, mark mismatch and require review;
- never purchase a second label or schedule a second pickup before reconciliation;
- return workflow remains linked to the original shipment and versioned eligibility decision.

## 12. Temporal Adoption Boundary

Use BullMQ initially for:

- media;
- webhook delivery;
- short retries;
- tasks under hours without complex state.

Use Temporal for:

- waits spanning days/months;
- multi-step external side effects;
- approvals;
- compensation;
- versioned long-running logic;
- workflows requiring query/signal.

Do not use Temporal as analytics event bus.

## 13. n8n Contract

n8n receives a signed event or polls integration API.

Allowed:

- client-specific transform;
- low-risk SaaS action;
- prototype connector;
- back-office notification.

Forbidden:

- tenant authorization decision;
- raw secret propagation;
- customer/conversation source of truth;
- global AI tool policy;
- storing state in workflow static data;
- irreversible action without platform approval.
- accepting redirect/screenshot as payment proof or inventing shipment status/ETA;
- storing payment/shipping credentials, full address, or proof artifact in workflow static data;
- directly executing refund, payout, label, pickup, cancellation, or return outside a signed ActionRequest and reconciliation contract.

n8n callback includes workflow/run ID, tenant, action ID, status, sanitized result, and signature.

## 14. Replay and DLQ

DLQ screen shows:

- tenant/provider;
- event/job type;
- first/last failure;
- attempt count;
- error class;
- payload schema version;
- side-effect uncertainty;
- suggested remediation.

Replay requires:

- permission;
- reason;
- corrected dependency/config;
- dry-run for high-risk action;
- new replay command linked to original.

## 15. Monitoring

Metrics:

- queue depth/lag;
- oldest job;
- success/retry/failure;
- stalled jobs;
- DLQ growth;
- outbox unpublished age;
- automation overdue timer;
- workflow duration;
- connector throttling.
- payment webhook lag, create uncertainty, reconciliation age/mismatch, paid-event processing, and reminder-stop lag;
- logistics webhook/poll freshness, unknown status mappings, stale shipments, open exceptions, and notification lag;

Alerts route by severity and affected tenant count.
