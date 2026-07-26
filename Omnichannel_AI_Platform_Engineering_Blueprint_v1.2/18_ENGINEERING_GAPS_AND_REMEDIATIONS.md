# Engineering Gaps and Remediation Register

| Metadata | Value |
|---|---|
| Status | Active implementation gate |
| Version | 1.0 |
| Date | 16 July 2026 |
| Scope | Blueprint v1.2 cross-document defects, omissions, and remediation |
| Owner | Founder / Platform Owner with Technical Owner |
| Review cadence | Every milestone and before production release |

## 1. Purpose

This register records contradictions, missing decisions, missing executable contracts, and hardening debt found across the engineering blueprint. It does not replace the source specifications. It adds an implementation gate so unresolved ambiguity is not silently converted into code.

Every item must have one of these states:

| State | Meaning |
|---|---|
| OPEN | Confirmed gap; no accepted resolution yet |
| DECIDED | Resolution accepted; implementation may begin |
| IN_PROGRESS | Implementation or documentation update underway |
| VERIFIED | Acceptance criteria passed with evidence |
| DEFERRED | Explicitly moved to a later stage with owner and reason |
| REJECTED | Finding determined invalid, with rationale |

## 2. Severity and Gate Policy

| Severity | Gate policy |
|---|---|
| BLOCKER | No dependent implementation may begin |
| CRITICAL | No production or tenant-data use; must be fixed in the current milestone |
| HIGH | Must be resolved before the affected capability is enabled |
| MEDIUM | May be scheduled, but must have an owner and target stage |
| LOW | Documentation, naming, or maintainability improvement |

Any tenant-isolation defect is release-blocking regardless of generic severity classification. Payment and logistics gates apply only when the corresponding optional module is enabled. Core AI Customer Service launch must not be blocked by disabled vertical modules.

## 3. Accepted Remediation Decisions

The following decisions were accepted during the implementation design review on 16 July 2026.

| ID | Decision | Rationale |
|---|---|---|
| DEC-001 | Build Stage 1 as contract-and-tenancy-first vertical slices | Produces runnable increments while testing boundaries end to end |
| DEC-002 | Core AI Customer Service precedes payment and logistics | Matches ADR-028 and prevents optional modules from becoming global blockers |
| DEC-003 | Provider integrations start with mock and sandbox adapters | Local development must not depend on external credentials or approvals |
| DEC-004 | Use transactional inbox plus a dispatcher to hand work to queues | Removes ambiguity between direct enqueue and database polling |
| DEC-005 | Give the outbox dispatcher explicit ownership of claim, lease, publish, retry, and replay | Makes at-least-once delivery auditable and testable |
| DEC-006 | Use SSE first for server-to-client operational realtime | MVP traffic is primarily server-to-client and can use native reconnect semantics |
| DEC-007 | Persist realtime event cursors and require snapshot refetch after a retention gap | Defines reconnect and stale-client behavior |
| DEC-008 | Separate operation execution state from business aggregate state | `UNKNOWN_RESULT` must not be confused with payment, shipment, or booking failure |
| DEC-009 | Add `CLIENT_ADMIN` to the canonical client role model | Aligns Product Scope, UX routes, and Security RBAC terminology |
| DEC-010 | Treat every tenant-isolation defect as a release blocker | Resolves the QA severity-policy conflict |
| DEC-011 | Adopt ADR-029 owner session, recovery, approval, and critical-action baseline | Makes the single-owner MVP fail closed without cosmetic approval |
| DEC-012 | Use short-lived OIDC workload identities and environment-gated local synthetic identities | Prevents browser/provider credential reuse by internal services |

## 4. Blockers

### GAP-001 - Canonical permission model is missing

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Missing contract |
| Status | DECIDED |
| Evidence | `01_PRODUCT_SCOPE.md:46-67`; `03_UX_UI_SPECIFICATION.md:367-397`; `10_SECURITY_PRIVACY_AND_RBAC.md:53-110` |
| Affected milestones | Identity and tenancy; every UI and API milestone |

The documents use inconsistent client roles and placeholders such as `Authorized`, `Entitled roles`, `guarded`, `scoped`, and `threshold approval`. The implementation requires a typed permission catalog and executable authorization inputs.

Remediation:

1. Canonical roles are `CLIENT_OWNER`, `CLIENT_ADMIN`, `CLIENT_MANAGER`, `CLIENT_AGENT`, `CLIENT_ANALYST`, and `CLIENT_VIEWER`.
2. Define resource-action permissions as versioned constants in `packages/auth` and expose sanitized capability results to the UI.
3. Authorization evaluates audience, principal status, tenant membership, permission, resource ownership, entitlement, state/version, masking, approval, and recent authentication.
4. Route visibility is derived from authorization results but never replaces server enforcement.

Acceptance criteria:

- Every route and mutation maps to one or more typed permissions.
- Wrong-audience and wrong-tenant tests fail closed.
- No API handler accepts a free-form role or permission string.
- Client sessions cannot render or call owner-only actions.

### GAP-002 - Single Platform Owner cannot provide independent approval or recovery

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Missing security decision |
| Status | DECIDED |
| Evidence | `10_SECURITY_PRIVACY_AND_RBAC.md:42-51,69,87,362` |
| Affected milestones | Identity and tenancy; high-risk actions; production readiness |

The MVP activates exactly one `PLATFORM_OWNER`, while some high-risk actions require approval. The documents do not define self-approval, client approval, break-glass recovery, owner succession, or zero-owner recovery.

Required decision:

- Define which Stage 1 actions can be self-approved, which require a Client Owner, and which remain disabled until a second independent approver exists.
- Define owner bootstrap, MFA recovery, break-glass storage, ownership transfer, and audit requirements.

Accepted resolution: ADR-029. Verification still requires authorization tests, identity-provider configuration, external audit notification, and an exercised recovery runbook.

Acceptance criteria:

- No high-risk action has an undefined approver.
- Loss of the owner authenticator has a documented, tested, audited recovery path.
- Self-approval, when allowed, is explicitly represented in policy and audit data.

### GAP-003 - Inbox-to-queue handoff is contradictory

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Architecture contradiction |
| Status | DECIDED |
| Evidence | `02_SYSTEM_ARCHITECTURE.md:31-45,163-184,326-342` |
| Affected milestones | Channel and conversation |

The container view shows Channel Edge writing to Redis, the sequence shows a worker claiming PostgreSQL inbox records, and deployment omits the Edge-to-Redis connection.

Remediation:

1. Channel Edge verifies, deduplicates, and persists `inbox_event` in PostgreSQL before acknowledgement.
2. An inbox dispatcher claims records with a database lease and enqueues only a wake-up/job reference.
3. The domain worker reloads the authoritative inbox record under trusted tenant context.
4. Queue loss is recoverable by scanning unprocessed inbox records.

Acceptance criteria:

- A committed inbox record is eventually processed after Redis loss and recovery.
- A duplicate provider event produces one logical domain result.
- Webhook acknowledgement never waits for AI or business connector calls.

### GAP-004 - Outbox publisher protocol has no owner or delivery contract

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Missing architecture contract |
| Status | DECIDED |
| Evidence | `02_SYSTEM_ARCHITECTURE.md:63-70,393-403`; `05_DATA_MODEL_AND_TENANCY.md:781-790` |
| Affected milestones | Foundation; all asynchronous features |

Remediation:

- Add one outbox dispatcher component responsible for claim leases, batching, partition key selection, publish acknowledgement, retry, dead-letter transition, and replay.
- Keep the database outbox authoritative until publish acknowledgement is persisted.
- Require consumer-side deduplication by `event_id`.

Acceptance criteria:

- Publisher crash before and after broker acknowledgement is covered by integration tests.
- Duplicate delivery is harmless.
- Ordering is documented and tested per aggregate or conversation partition.

### GAP-005 - Realtime transport and replay semantics are incomplete

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Missing contract |
| Status | DECIDED |
| Evidence | `02_SYSTEM_ARCHITECTURE.md:72-79,326-355`; `06_API_AND_REALTIME_CONTRACT.md:384-420` |
| Affected milestones | Operational inbox |

Remediation:

- Stage 1 uses SSE for operational server-to-client events.
- Every event uses the canonical envelope: event ID, schema version, tenant, aggregate type/ID/version, timestamps, correlation/causation, and sanitized payload.
- Persist a bounded per-tenant replay stream and support `Last-Event-ID`.
- When a cursor predates retention or a version gap cannot be reconciled, return a refetch-required control event.

Acceptance criteria:

- Reconnect replays missed events without duplicating visible state.
- Cross-tenant subscriptions fail closed.
- Events without a usable aggregate version define an explicit merge/refetch policy.

### GAP-006 - Idempotency lifecycle and concurrency semantics are incomplete

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Missing API/data contract |
| Status | DECIDED |
| Evidence | `02_SYSTEM_ARCHITECTURE.md:272-287`; `05_DATA_MODEL_AND_TENANCY.md:792-800`; `06_API_AND_REALTIME_CONTRACT.md:44-64,476-481` |
| Affected milestones | Foundation; all mutations |

Remediation:

- Persist audience, tenant, operation, idempotency key, request hash, operation status, response reference, and expiry.
- Canonical operation states are `PROCESSING`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_FINAL`, and `UNKNOWN_RESULT`.
- Same key plus different hash is a conflict. Same key while processing returns the existing operation reference.
- `If-Match` is canonical for HTTP aggregate concurrency; internal commands carry the same expected version. If both are supplied and differ, reject the request.
- Retention is operation-specific and must exceed the external provider retry/replay window.

Acceptance criteria:

- Concurrent duplicate requests produce one side effect.
- Unknown external outcomes cannot be retried until reconciliation.
- Version conflicts never silently overwrite a newer aggregate.

### GAP-007 - Worker tenant context for unresolved provider events is undefined

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Missing tenancy contract |
| Status | DECIDED |
| Evidence | `05_DATA_MODEL_AND_TENANCY.md:38-48,768-779,843-864` |
| Affected milestones | Channel and conversation; payment; logistics |

Remediation:

- Resolve provider account through an opaque endpoint/account mapping before setting tenant context.
- Store the resolved `tenant_id` and provider account ID in the verified inbox record.
- Unknown, ambiguous, or disabled account mappings enter a restricted quarantine path and never execute domain code.
- Workers set RLS context only from the persisted verified mapping, never from provider payload fields.

Acceptance criteria:

- Missing or ambiguous account mapping cannot access tenant tables.
- Tampering with a provider-supplied tenant identifier has no effect.
- Quarantine access is restricted and audited.

### GAP-008 - Command and event lifecycle is not executable

| Field | Value |
|---|---|
| Severity | BLOCKER |
| Category | Missing contract |
| Status | OPEN |
| Evidence | `07_EVENTS_AUTOMATIONS_AND_JOBS.md:14-39,141-192` |
| Affected milestones | Foundation; automation; AI actions |

Missing pieces include a command envelope, deadline/cancellation semantics, command-to-event mapping, `automation_run.completed`, provider migration failure/rollback events, appointment confirmation, and conversation waiting triggers.

Required remediation:

- Define versioned command and event schemas in `packages/contracts` before implementing their handlers.
- Add terminal success/failure events for every workflow.
- Define which event is authoritative at transport, domain, and provider-status layers.

Acceptance criteria:

- Every command has one documented handler, idempotency scope, result model, and possible terminal events.
- Every automation trigger refers to an existing canonical event.

## 5. Critical Gaps

### GAP-009 - Provider adapter is shown writing the database directly

| Field | Value |
|---|---|
| Severity | CRITICAL |
| Category | Architecture contradiction |
| Status | DECIDED |
| Evidence | `02_SYSTEM_ARCHITECTURE.md:146-159,181-184` |

Provider adapters return normalized results to their owning worker. Only domain repositories may update canonical projections. Delivery callbacks re-enter through the verified inbox path.

Acceptance criteria:

- Connector packages have no database dependency.
- Architecture tests reject imports from connector adapters to domain repositories.

### GAP-010 - Transport and semantic normalization responsibilities overlap

| Field | Value |
|---|---|
| Severity | CRITICAL |
| Category | Ambiguous ownership |
| Status | DECIDED |
| Evidence | `02_SYSTEM_ARCHITECTURE.md:80-99` |

Channel Edge owns transport verification and envelope normalization. Channel workers own semantic normalization, identity resolution, canonical messages, and attachments.

Acceptance criteria:

- Provider dedup identity is created once at ingress.
- Semantic parsing can be replayed from the persisted transport envelope.

### GAP-011 - Policy engine and action executor boundaries are crossed

| Field | Value |
|---|---|
| Severity | CRITICAL |
| Category | Architecture contradiction |
| Status | DECIDED |
| Evidence | `02_SYSTEM_ARCHITECTURE.md:133-140,196-216` |

The policy engine decides; it does not invoke Calendar or other providers. An action executor or workflow performs both read-only and mutating tool calls, records normalized results, and returns sanitized output to AI/runtime.

Acceptance criteria:

- Policy package has no connector imports.
- Every tool execution has an `ActionRequest`, policy decision, trace, and normalized result.

### GAP-012 - Optional vertical modules are treated as global launch gates

| Field | Value |
|---|---|
| Severity | CRITICAL |
| Category | Scope contradiction |
| Status | DECIDED |
| Evidence | `14_ENGINEERING_BACKLOG.md:17-29,337-340,673-682`; `15_ADR_REGISTER.md:306-318`; `17_PAYMENT_AND_LOGISTICS_SPEC.md:14-19,590` |

Core Stage 1 and each optional vertical use separate promotion gates. Payment and logistics requirements are `Must when enabled`, not global core requirements.

Acceptance criteria:

- Core can be deployed with both modules disabled and no module jobs, routes, navigation, or AI tools active.
- Enabling a module requires its own adapter, isolation, reconciliation, security, UX, metric, and runbook gate.

### GAP-013 - Isolation defects can be released under generic severity rules

| Field | Value |
|---|---|
| Severity | CRITICAL |
| Category | QA policy contradiction |
| Status | DECIDED |
| Evidence | `12_QA_AND_TEST_STRATEGY.md:3-11,412-430` |

Any confirmed tenant-isolation failure is release-blocking. It cannot be downgraded into a releasable Major issue.

Acceptance criteria:

- CI labels all isolation-suite failures as blocking.
- Release checklist explicitly requires zero open isolation defects of any severity.

### GAP-014 - Raw webhook quarantine may retain prohibited data

| Field | Value |
|---|---|
| Severity | CRITICAL |
| Category | Privacy/security omission |
| Status | OPEN |
| Evidence | `10_SECURITY_PRIVACY_AND_RBAC.md:160-174,272-277`; `17_PAYMENT_AND_LOGISTICS_SPEC.md:197-207` |

Required remediation:

- Define redaction order before persistence, restricted encryption context, retention period, access policy, and incident handling for prohibited payment credentials or sensitive proof/address data.

Acceptance criteria:

- Synthetic prohibited fields never appear in application logs, standard inbox payloads, traces, analytics, or DLQ.
- Restricted quarantine storage has explicit retention and audited access.

## 6. High Gaps

### GAP-015 - Payment `UNKNOWN_RESULT` has no operation-state model

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | DECIDED |
| Evidence | `17_PAYMENT_AND_LOGISTICS_SPEC.md:148-163,488-493`; `GLOSSARY.md:54` |

Use the canonical operation execution state from GAP-006. Do not add `UNKNOWN_RESULT` to payment business status, and do not confuse it with shipment status `UNKNOWN`.

### GAP-016 - Payment request, attempt, refund, and dispute states overlap

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | OPEN |
| Evidence | `17_PAYMENT_AND_LOGISTICS_SPEC.md:132-163` |

Required decision:

- Separate request lifecycle, attempt lifecycle, transaction settlement projection, refund lifecycle, dispute lifecycle, and derived invoice/payment summary.
- Define refresh-link and multiple-attempt validity rules.

### GAP-017 - Partial payment aggregation is undefined

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | DEFERRED |
| Target | Stage 2 |
| Evidence | `17_PAYMENT_AND_LOGISTICS_SPEC.md:146-161,592-596` |

No Stage 1 schema or UI may imply partial payment support. Stage 2 requires a separate ADR for request/transaction/invoice aggregation.

### GAP-018 - Shipment transition and aggregation rules are missing

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | OPEN |
| Evidence | `17_PAYMENT_AND_LOGISTICS_SPEC.md:216-247,536-540,637-640` |

Required remediation:

- Define allowed and recovery transitions, precedence for late events, package-to-shipment aggregation, shipment-to-order aggregation, and relation between return entities and `RETURNING`/`RETURNED` states.

### GAP-019 - Retention policy is still Proposed

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | OPEN |
| Evidence | `15_ADR_REGISTER.md:249-257`; `10_SECURITY_PRIVACY_AND_RBAC.md:245-293` |

Required remediation:

- Accept versioned defaults per data class and tenant override boundaries.
- Define deletion propagation to search/vector, object versions, cache, analytics, backups, AI providers, and subprocessors.

### GAP-020 - Audit immutability is declarative only

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | OPEN |
| Evidence | `10_SECURITY_PRIVACY_AND_RBAC.md:284-295` |

Required remediation:

- Define append-only database permissions, integrity verification, external security sink or WORM strategy, tamper alerts, and owner privilege separation.

### GAP-021 - Authentication and workload identity parameters are missing

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | DECIDED |
| Evidence | `10_SECURITY_PRIVACY_AND_RBAC.md:29-51,133-145` |

Required decisions include session TTL, idle timeout, recent-auth window, refresh-token rotation/reuse detection, lockout thresholds, recovery-code policy, and service identity mechanism.

Accepted resolution: ADR-029 defines session/token limits, recent authentication, rotation/reuse behavior, recovery controls, workload identity, and local/test simulation boundaries. Brute-force threshold implementation remains an identity-provider configuration task.

### GAP-022 - Connector configuration and secret ownership are ambiguous

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | OPEN |
| Evidence | `01_PRODUCT_SCOPE.md:46-51`; `03_UX_UI_SPECIFICATION.md:393-396`; `PRD_Arsitektur_Omnichannel_AI_Customer_Operations_Platform.md:1239-1246` |

Required remediation:

- Separate client-initiated OAuth/secure-entry flows, masked connection metadata, operator-only secret references, rotation, and revocation permissions.

### GAP-023 - Support impersonation is not safely defined

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | OPEN |
| Evidence | `03_UX_UI_SPECIFICATION.md:187-195`; `01_PRODUCT_SCOPE.md:40-44` |

Use scoped support access rather than silent identity impersonation unless a later security ADR explicitly defines session substitution. Scope, reason, TTL, revocation, read/write limits, and visible audit indicators are required.

### GAP-024 - n8n callback security contract is incomplete

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | OPEN |
| Evidence | `07_EVENTS_AUTOMATIONS_AND_JOBS.md:483-506` |

Required remediation:

- Define signature algorithm, key ID/rotation, timestamp/nonce, replay window, callback status schema, idempotency, timeout, cancellation, and redaction.

### GAP-025 - BullMQ versus Temporal ownership is ambiguous

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | DECIDED |
| Evidence | `07_EVENTS_AUTOMATIONS_AND_JOBS.md:194-213,463-479` |

BullMQ owns short, bounded, replayable tasks. Temporal owns any workflow with long waits, approval, compensation, or an external mutation that can return an uncertain result, regardless of nominal duration.

### GAP-026 - WhatsApp provider migration contract is incomplete

| Field | Value |
|---|---|
| Severity | HIGH |
| Status | DEFERRED |
| Target | After stable Meta Direct Stage 1 |
| Evidence | `09_CHANNEL_AND_CONNECTOR_SPEC.md:99-164`; `07_EVENTS_AUTOMATIONS_AND_JOBS.md:58-65,399-410` |

Required before migration support: cutover lock, queue drain, dual-send prevention, rollback/failure events, external-ID continuity, status mapping, and session-secret revocation.

## 7. Medium Gaps

### GAP-027 - Information architecture is not canonical

Owner routes for conversations/templates are missing, while payment/shipment appear both under Commerce and as top-level navigation. Define one route/navigation manifest before implementing those surfaces. Evidence: `03_UX_UI_SPECIFICATION.md:44-72,96-129,363-397`; `PRD_Arsitektur_Omnichannel_AI_Customer_Operations_Platform.md:1203-1237`.

### GAP-028 - Multi-tenant client membership timing is inconsistent

UX assumes a tenant switcher while multi-tenant membership is described as Stage 2. Stage 1 supports one active tenant membership per client session; the data model may support multiple memberships, but no switcher is rendered until enabled. Evidence: `03_UX_UI_SPECIFICATION.md:24-30`; `PRD_Arsitektur_Omnichannel_AI_Customer_Operations_Platform.md:987-997`.

### GAP-029 - KPI definitions are not executable

Terms such as eligible, validation window, attribution window, paused duration, sufficient data, valid offer, stale threshold, and reconciliation tolerance lack predicates or values. Add a versioned metric manifest before dashboard production use. Evidence: `11_ANALYTICS_AND_KPI_DICTIONARY.md:59-250,366-399,444-453`.

### GAP-030 - Analytics dependency graph omits producers

Analytics depends on AI, lead, booking, usage, payment, and logistics events, not only inbox. Update backlog dependencies and event lineage. Evidence: `14_ENGINEERING_BACKLOG.md:17-29,380-405`; `11_ANALYTICS_AND_KPI_DICTIONARY.md:292-364`.

### GAP-031 - Client Home precedes the semantic metric pipeline

Stage 1 Home may use an explicitly labeled minimal operational projection, but no temporary KPI may silently diverge from the semantic definition. Evidence: `14_ENGINEERING_BACKLOG.md:241-246,380-397`.

### GAP-032 - Exact toolchain versions are not pinned

Bootstrap must record exact Node, pnpm, framework, database, extension, and image versions after documentation and compatibility verification. Floating `latest` is prohibited in production. Evidence: `16_TECH_STACK_AND_REPO_STANDARDS.md:3-12`.

### GAP-033 - Generic Provider glossary definition is too narrow

Expand `Provider` to include channel, AI, payment, logistics, and other external capability implementations. Evidence: `GLOSSARY.md:8`; `17_PAYMENT_AND_LOGISTICS_SPEC.md:95-105`.

### GAP-034 - Raw payment credential terminology is ambiguous

Distinguish prohibited customer payment credentials from merchant/provider integration credentials stored in a secret manager. Evidence: `README.md:37`; `17_PAYMENT_AND_LOGISTICS_SPEC.md:117,197-207,464-466`.

### GAP-035 - SLO and alert definitions lack measurement details

Define measurement window, latency objective, error-budget policy, burn-rate windows, provider exclusions, and concrete alert thresholds. Evidence: `13_DEVOPS_SRE_AND_RUNBOOKS.md:196-239`.

### GAP-036 - Backup launch and restore-exercise gates are inconsistent

Define the minimum restore evidence required for MVP production versus the quarterly production-ready exercise. Evidence: `10_SECURITY_PRIVACY_AND_RBAC.md:355-370`; `12_QA_AND_TEST_STRATEGY.md:403-410`; `13_DEVOPS_SRE_AND_RUNBOOKS.md:116-127`.

### GAP-037 - Website Widget contract is under-specified

Define embed origin policy, visitor session lifecycle, identity handoff, rate limits, media limits, realtime transport, consent, and escalation behavior before widget implementation. Evidence: `01_PRODUCT_SCOPE.md:14-16,146,178`.

### GAP-038 - Model release rollback is not modeled

Prompt releases have lifecycle semantics but model routing/deployment releases do not. Add a versioned routing release with canary and rollback before non-mock provider rollout. Evidence: `08_AI_AGENT_AND_KNOWLEDGE.md:188-205,418-433`.

## 8. Documentation Remediation Queue

The following source documents must be updated when the corresponding gap becomes `VERIFIED`:

| Gap group | Documents to update |
|---|---|
| Permission and identity | Product Scope, UX/UI, Security/RBAC, API Contract, ADR Register |
| Inbox/outbox/realtime | System Architecture, Data Model, API Contract, Events/Jobs, Tech Stack |
| Commands and workflows | Events/Jobs, AI/Knowledge, Connector Spec, API Contract |
| Retention and privacy | Data Model, Security/RBAC, DevOps/SRE, ADR Register |
| Payment/logistics states | Payment/Logistics Spec, Data Model, API Contract, Events, Analytics, QA |
| KPI predicates | Analytics/KPI, API Contract, Backlog, UX/UI |

## 9. Verification Checklist

A gap can be marked `VERIFIED` only when all applicable evidence exists:

- Accepted ADR or explicit contract decision.
- Schema, migration, or policy implementation.
- Unit and integration tests.
- Wrong-tenant and wrong-audience negative tests.
- Duplicate, replay, out-of-order, and timeout tests for asynchronous behavior.
- Audit and metric evidence.
- UI loading, empty, error, partial, stale, and permission states.
- Operational alert, runbook, rollback, or kill switch where required.
- Documentation source files updated to match implementation.

## 10. Immediate Build Gates

Milestone 1 may begin with accepted decisions in this register. Before Milestone 2 implementation, GAP-001 and the Stage 1 subset of GAP-002 and GAP-021 must be decided. Before provider webhook processing, GAP-003, GAP-004, GAP-007, GAP-009, and GAP-010 must be verified. Before operational inbox realtime, GAP-005 must be verified. Before any external mutation, GAP-006, GAP-011, and the relevant operation-state rules must be verified.
