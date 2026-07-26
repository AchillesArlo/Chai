# DevOps, SRE, and Operational Runbooks

## 1. Environment Strategy

| Environment | Purpose | Deployment |
|---|---|---|
| local | Developer loop | Docker Compose |
| test | Automated CI | Ephemeral containers |
| staging | Integration/UAT/load subset | Production-like managed services |
| production | Live | HA managed infrastructure |

Environment isolation:

- separate cloud project/account where practical;
- separate database/cache/bucket;
- separate secrets/KMS;
- separate provider accounts/test numbers;
- distinct domains and telemetry labels.

## 2. Infrastructure Components

### MVP

- CDN/WAF/load balancer;
- owner-console and client-portal;
- API replicas;
- webhook edge replicas;
- realtime gateway;
- worker groups;
- managed PostgreSQL;
- managed Redis;
- object storage;
- AI Gateway;
- n8n integration deployment;
- isolated payment webhook/command/reconciliation workers;
- isolated logistics webhook/command/poll workers;
- secret manager/KMS;
- telemetry backend;
- CI/CD registry.

### Production-ready

- multi-AZ services;
- PostgreSQL PITR and read replica as needed;
- Redis HA;
- object replication/lifecycle;
- autoscaling;
- OpenTelemetry collector;
- status page;
- DR environment;
- dedicated Community Gateway pool;
- ClickHouse/analytics pipeline when triggered.

## 3. Configuration

Configuration categories:

| Category | Storage |
|---|---|
| Build-time public | Versioned environment config |
| Runtime non-secret | Config service/environment |
| Secret | Secret manager |
| Tenant business config | PostgreSQL, audited/versioned |
| Provider routing | Control plane, published version |
| Feature flags | Central flag/entitlement |

No production secret in repository, image, client bundle, or plain environment dump.

## 4. CI Pipeline

On pull request:

1. dependency restore with lockfile;
2. lint/type/import boundary;
3. unit/component;
4. schema/OpenAPI/event validation;
5. integration with PostgreSQL/Redis;
6. RLS/authorization tests;
7. security/secret/dependency scan;
8. build images/apps;
9. preview environment where useful;
10. required review.

Main branch:

- immutable version/tag;
- SBOM;
- signed container;
- migration artifact;
- release notes;
- deploy staging;
- smoke/E2E.

## 5. CD Pipeline

Production flow:

1. Change approval.
2. Verify backup and dependency health.
3. Apply backward-compatible migration.
4. Deploy stateless/API/worker canary.
5. Run smoke/synthetic checks.
6. Increase traffic.
7. Verify SLO/queue/provider.
8. Enable feature flag by tenant cohort.
9. Record deployment marker.

Rollback:

- revert application image;
- disable feature flag;
- do not reverse destructive migration automatically;
- use expand/contract schema;
- stop automation/tool if unsafe.

## 6. Database Operations

- managed PostgreSQL HA;
- daily automated backup plus PITR;
- encrypted;
- migration lock;
- connection pool;
- slow query monitoring;
- index bloat/vacuum monitoring;
- separate owner/runtime roles;
- quarterly restore exercise at production-ready.

Migration checklist:

- compatibility;
- RLS;
- index creation impact;
- backfill plan;
- rollback/disable;
- event/API version;
- capacity.

## 7. Redis and Queue Operations

Monitor:

- memory/eviction;
- connections;
- latency;
- queue depth/lag;
- stalled jobs;
- failed/retry;
- oldest job;
- rate-limit state.

Redis is not business source of truth. Outbox enables recovery.

## 8. Object Storage

- private;
- encryption;
- tenant prefixes/policies;
- versioning where required;
- lifecycle;
- malware status;
- orphan cleanup;
- presigned expiry;
- egress monitoring.

## 9. Observability

### Signals

- traces;
- metrics;
- structured logs;
- business/audit events;
- AI traces.

### Correlation

request_id, correlation_id, tenant_id, conversation_id, message_id, workflow_id, provider call ID.

PII/secret redaction before export.

### Required dashboards

1. Platform SLO.
2. API/webhook latency/error.
3. Queue/workers.
4. PostgreSQL/Redis.
5. AI provider/model quality/cost.
6. Channel/connector.
7. Automation/Temporal.
8. Community Gateway sessions.
9. Data pipeline/freshness.
10. Security/audit anomalies.
11. Payment provider/webhook/reconciliation/mismatch.
12. Shipping provider/freshness/unknown mappings/delivery exceptions.

## 10. SLOs

| Service | Indicator | Target production |
|---|---|---:|
| Core API | Successful eligible requests | 99.9% |
| Webhook Edge | Verified event persist/ack | 99.9% |
| Message processing | Logical completion after retry | 99.9% |
| Realtime | Delivery of committed notification | 99.5% |
| Dashboard | Available/fresh within target | 99.5% |
| Payment projection | Accepted verified webhook reflected within platform target | 99.9% |
| Shipment projection | Accepted provider event reflected within platform target | 99.5% |

Community Gateway channel availability excluded from production SLO.
Payment settlement and carrier transit/ETA are provider outcomes and excluded unless explicitly contracted; platform SLO covers secure ingestion, projection, reconciliation, notification dispatch, and freshness disclosure.

## 11. Alerting

### Page immediately

- suspected cross-tenant exposure;
- owner credential compromise;
- DB unavailable/data corruption;
- large-scale message processing failure;
- unauthorized destructive action;
- backup/PITR unavailable beyond threshold.

### High-priority ticket/page by impact

- SLO burn;
- webhook failures;
- queue lag;
- all AI fallbacks exhausted;
- major connector outage;
- multiple tenants affected;
- cost spike.
- payment webhook silence, false/uncertain state risk, or reconciliation mismatch beyond threshold;
- shipment webhook/poll freshness breach, unknown mapping spike, or high-severity delivery exceptions;

### Ticket

- single token expiry;
- knowledge freshness;
- low-risk data reconciliation;
- Community reauth unless contract says otherwise.

## 12. Capacity Management

Track:

- tenants/accounts;
- messages/sec;
- concurrent conversations;
- queue lag;
- DB storage/IO/connection;
- object storage/egress;
- AI RPM/TPM/cost;
- worker utilization;
- payment requests/webhooks/reconciliation rate and oldest mismatch;
- active shipments, provider polling rate, event freshness, and open-exception age;
- realtime connections.

Capacity review monthly and before large tenant onboarding.

## 13. Backup and Disaster Recovery

### Backup

- PostgreSQL PITR;
- daily snapshots;
- object version/lifecycle;
- configuration/IaC in Git;
- secret manager backup/rotation procedure;
- Temporal/ClickHouse backup when introduced.
- payment/shipment canonical state, audit, mapping versions, and reconciliation records in PostgreSQL backup; provider truth is re-queried after restore where possible.

### Targets

- MVP RPO 24h, RTO 8h.
- Production RPO ≤5m, RTO ≤1h for core, subject to validated architecture.

### DR exercise

1. Declare exercise.
2. Restore DB to isolated environment.
3. Verify RLS and integrity.
4. Restore object references.
5. Rebuild cache/search where applicable.
6. Reconcile outbox/provider state.
7. Run critical journeys.
8. Record actual RPO/RTO.

## 14. Incident Management

Lifecycle:

DETECTED → TRIAGED → CONTAINED → MITIGATED → RESOLVED → REVIEWED.

Incident record:

- severity;
- commander;
- timeline;
- affected tenants/services;
- customer communication;
- data/security assessment;
- actions;
- root cause;
- follow-ups.

## 15. Runbook: Cross-Tenant Exposure Suspected

1. Declare SEV1 and restrict owner/admin access.
2. Disable affected endpoint/feature via flag.
3. Preserve logs/traces/audit; do not delete.
4. Identify data/action scope.
5. Revoke compromised sessions/credentials.
6. Validate RLS/application authorization.
7. Engage privacy/legal notification workflow.
8. Patch and run isolation suite.
9. Restore service by controlled cohort.
10. Complete post-incident review.

## 16. Runbook: Webhook Backlog

1. Check provider ingress vs acknowledgement.
2. Check oldest inbox/outbox and queue lag.
3. Determine tenant/provider hot key.
4. Scale worker if downstream healthy.
5. Apply per-tenant backpressure.
6. Check DB/Redis.
7. Pause low-priority sync/export.
8. Reconcile duplicates after recovery.

## 17. Runbook: AI Provider Outage

1. Confirm provider/region/model.
2. Open circuit.
3. Route to evaluated fallback.
4. Reduce non-critical/batch calls.
5. Handover when no safe fallback.
6. Notify affected tenants if material.
7. Reconcile cost/error and close circuit gradually.

## 18. Runbook: Community Gateway Disconnected

1. Mark DEGRADED/REAUTH_REQUIRED.
2. Stop outbound queue for account.
3. Notify Platform Owner and authorized client contact.
4. Check gateway/session/device/account state.
5. Re-pair only through audited flow.
6. Do not replay uncertain sends blindly.
7. If recurring/blocked, initiate Meta Direct migration.
8. Community outage does not trigger production SLA compensation.

## 19. Runbook: Meta Token/Permission Failure

1. Mark channel degraded.
2. Stop impossible outbound; preserve outbox.
3. Check token expiry/scopes/business account.
4. Rotate/re-authorize.
5. Test inbound/outbound.
6. Reconcile backlog within policy windows.

## 20. Runbook: Queue Item in DLQ

1. Inspect sanitized error and side-effect certainty.
2. Correct dependency/config/data if possible.
3. Use dry-run.
4. Approve replay with reason.
5. Link replay to original.
6. Verify result and metric/audit.

## 21. Runbook: Database Degradation

1. Stop non-critical writes/jobs.
2. Verify provider/managed service status.
3. Check connections/locks/slow queries/storage.
4. Failover according to managed procedure.
5. Keep webhook acknowledgements only if event safely persisted.
6. Reconcile outbox/inbox after recovery.

## 22. Runbook: Cost Spike

1. Identify tenant/model/task/retry.
2. Check abuse/loop/provider pricing change.
3. Enforce budget/circuit.
4. Route lower tier where safe.
5. Stop non-critical batch.
6. Notify owner/client if quota.
7. Correct routing/automation and reconcile.

## 23. Runbook: Payment Webhook or Reconciliation Mismatch

1. Identify tenant, provider account, request/attempt, external IDs, amount/currency, and last verified evidence.
2. Freeze unsafe linked fulfillment/booking activation if policy requires; do not mark paid from redirect/screenshot.
3. Check signing key/version, webhook verification/quarantine, inbox/outbox, queue lag, provider status, and clock skew.
4. Query the provider using authenticated reconciliation and existing idempotency/business reference.
5. Never create a replacement charge/link until the uncertain result is resolved or deliberately cancelled.
6. Preserve both local/provider facts, raw restricted reference, and audit timeline.
7. Correct mapping/state through an approved reconciliation action, not direct database editing.
8. Notify the authorized client finance/owner contact when material; invoke legal/security process if credentials or funds may be affected.
9. Add regression fixture and close the provider circuit gradually.

## 24. Runbook: Shipment Tracking Stale or Delivery Exception

1. Identify tenant/provider account/shipment and verify contact/order relationship.
2. Check last webhook/poll, provider health/rate limit/token, mapping version, queue lag, and marketplace ownership.
3. Run one authenticated reconciliation within rate limits; avoid duplicate label/pickup/return mutation.
4. If provider status is unknown, retain provider code, set UNKNOWN/stale, and do not invent ETA.
5. Open/assign the appropriate exception and contact customer through permitted channel/template.
6. Mask address/proof data in incident collaboration and logs.
7. For lost/damaged/return/legal complaint, hand over to the client’s responsible team and preserve evidence references.
8. Resume polling/notifications by controlled state and add mapping/test fixture where needed.

## 25. Operational Readiness Review

Before production:

- dashboards/alerts;
- on-call owner;
- runbooks tested;
- backup restore;
- capacity/load;
- secrets rotation;
- dependency status;
- status/communication channel;
- rollback/kill switches;
- tenant support contacts.
- payment/shipping provider contacts and sandbox/live ownership;
- hosted-checkout/PCI-scope, payment licensing/contract, and shipping privacy review recorded;
- webhook/reconciliation synthetic monitors healthy;
- payment mismatch and shipment exception runbooks exercised;
- high-risk payment/logistics capabilities disabled unless their explicit gate passed.
