# Architecture Decision Record Register

## ADR Status

- Accepted: implementation default.
- Proposed: validate before dependent work.
- Superseded: historical.
- Rejected: considered but not selected.

## ADR-001 — Modular Monolith First

Status: Accepted.

Decision:

- domain core in one modular codebase/deployment family;
- independent API/worker processes;
- extract service only on measured trigger.

Reason:

- faster product iteration;
- simpler transactions;
- smaller operations burden.

Consequences:

- strict module boundaries/import rules required;
- outbox/events preserve extraction path.

## ADR-002 — PostgreSQL Source of Truth

Status: Accepted.

Decision:

- PostgreSQL owns operational business state;
- Redis/n8n/AI trace stores are not authoritative.

## ADR-003 — Tenant as Primary Boundary

Status: Accepted.

Decision:

- tenant, not WhatsApp number, is primary boundary;
- channel accounts belong to tenant;
- contacts may unify across channel accounts only inside tenant.

## ADR-004 — PostgreSQL RLS Defense-in-Depth

Status: Accepted.

Decision:

- RLS default-deny;
- runtime role not owner/BYPASSRLS;
- application authorization remains required.

## ADR-005 — Separate Owner and Client Audiences

Status: Accepted.

Decision:

- separate applications or strict deployment surfaces;
- separate token audiences and API namespaces.

MVP:

- only Founder PLATFORM_OWNER can access owner surface.

## ADR-006 — REST + Realtime Events

Status: Accepted.

Decision:

- REST/OpenAPI for commands/queries;
- WebSocket/SSE for live updates;
- no GraphQL initially.

## ADR-007 — Transactional Inbox/Outbox

Status: Accepted.

Decision:

- external event dedup in inbox;
- business mutation + outbox + audit in transaction;
- at-least-once consumers with idempotency.

## ADR-008 — BullMQ then Temporal

Status: Accepted.

Decision:

- BullMQ for short async work;
- Temporal for multi-day durable workflows, approvals, compensation.

## ADR-009 — n8n as Integration Layer

Status: Accepted.

Decision:

- n8n handles custom/low-risk integrations;
- no business source of truth, tenant auth, or core AI policy in n8n.

## ADR-010 — Provider-Neutral AI Contract

Status: Accepted.

Decision:

- internal normalized AI request/response;
- logical model aliases;
- LiteLLM replaceable implementation;
- native/compatible/local/custom endpoints supported.

## ADR-011 — AI Proposes, Policy Executes

Status: Accepted.

Decision:

- AI never directly invokes external side effect;
- Tool Policy Engine validates schema, tenant, permission, consent, state, and approval.

## ADR-012 — Hybrid RAG in PostgreSQL First

Status: Accepted.

Decision:

- PostgreSQL full-text + pgvector;
- dedicated search/vector engine only after benchmark/scale trigger.

## ADR-013 — Object Storage for Media

Status: Accepted.

Decision:

- private S3-compatible storage;
- queue/events carry references;
- isolated processing and retention.

## ADR-014 — WhatsApp Provider Strategy

Status: Accepted.

Decision:

- Meta Direct + own webhook is production default;
- BSP supported by adapter;
- Community Gateway optional, high-risk, best-effort, no channel SLA;
- all modes behind provider router and canonical data.

## ADR-015 — Read-Before-Write Commerce

Status: Accepted.

Decision:

- product/order/inventory read actions first;
- write actions require idempotency, source version, approval, reconciliation.

## ADR-016 — Client Configuration Safety Tiers

Status: Accepted.

Decision:

- safe self-service;
- guarded self-service;
- owner-only;
- two-person/strong approval for critical actions.

## ADR-017 — Analytics Evolution

Status: Accepted.

Decision:

- PostgreSQL metric events/aggregates for MVP;
- ClickHouse when volume/query/freshness justifies.

## ADR-018 — Managed Containers Before Kubernetes

Status: Accepted.

Decision:

- Docker Compose local;
- managed containers/VM orchestration MVP;
- Kubernetes only when scale/operations requires.

## ADR-019 — OIDC Provider Abstraction

Status: Accepted.

Decision:

- standards-based OIDC;
- managed identity accelerates MVP;
- enterprise SSO/SAML/SCIM later.

## ADR-020 — UUIDv7 and UTC

Status: Accepted.

Decision:

- sortable UUID primary keys;
- UTC storage;
- tenant/customer timezone at presentation and scheduling boundary.

## ADR-021 — Contract-First Development

Status: Accepted.

Decision:

- API/event schemas reviewed before parallel frontend/backend;
- generated clients/fixtures;
- compatibility checks in CI.

## ADR-022 — Light Theme First, Token-Ready

Status: Accepted.

Decision:

- production light theme initially;
- semantic design tokens allow dark/white-label later.

## ADR-023 — Two Web Apps Recommended

Status: Accepted.

Decision:

- owner-console and client-portal separate apps/deployable units;
- shared UI/contracts packages;
- reduces accidental owner route exposure.

## ADR-024 — Retention Defaults Are Configurable

Status: Proposed pending legal/client review.

Decision proposal:

- adopt defaults in Data Model spec;
- tenant package/policy may shorten/extend within legal bounds;
- legal hold supported.

## ADR-025 — Tech Provider Path for WhatsApp

Status: Proposed.

Decision proposal:

- begin Meta Tech Provider/Embedded Signup readiness in Stage 0;
- controlled manual onboarding for limited pilots;
- do not block Community lab spike.

## ADR-026 — Payment Orchestration, Not Custody

Status: Accepted.

Decision:

- tenant connects its own merchant/payment-provider account;
- provider-hosted checkout is the initial collection surface;
- funds settle under the provider/client merchant relationship;
- platform stores payment requests, attempts, verified projections, attribution, and reconciliation, not raw payment credentials or a replacement settlement ledger;
- verified provider webhook/query is required for paid state;
- refund/payout/split/recurring capabilities require separate stage, approval, and legal/compliance gates.

Consequences:

- provider adapter, webhook, idempotency, unknown-result, and reconciliation are mandatory foundations;
- payment gateway licensing/merchant contract and PCI scope are reviewed per market/use case;
- any future platform aggregation/submerchant/money movement changes this decision and requires a new ADR.

## ADR-027 — Canonical Logistics with Provider Truth

Status: Accepted.

Decision:

- carrier, aggregator, OMS/ERP, or marketplace is shipment/tracking source of truth;
- platform owns canonical shipment/package/tracking/exception projections and automations;
- read-only tracking precedes shipment/label/pickup/cancel/return mutations;
- provider codes map through a versioned taxonomy; unknown code fails safe;
- customer tracking access verifies contact/order ownership, not tracking reference alone.

Consequences:

- multiple shipments/packages and partial fulfillment are first-class;
- webhook plus state-aware polling/reconciliation is required;
- cost-bearing/destructive logistics actions use policy, confirmation/approval, idempotency, and reconcile-before-retry.

## ADR-028 — Optional Vertical Modules in Stage 1

Status: Accepted.

Decision:

- hosted payment link and read-only shipment tracking may ship in Stage 1 behind tenant entitlements;
- they do not block the core AI CS launch for tenants that do not enable them;
- an enabled tenant must pass the module-specific security, provider, reconciliation, QA, observability, and runbook gate.

Reason:

- booking/direct-commerce design partners gain end-to-end value without forcing financial/logistics complexity on every tenant.

## ADR-029 — MVP Owner Security, Approval, and Workload Identity

Status: Accepted.

Context:

- MVP activates exactly one Founder `PLATFORM_OWNER`;
- high-risk actions still need an explicit approver and recovery cannot depend on an active second internal account;
- owner and client browser sessions need concrete limits before authentication code is implemented;
- internal services need a non-user workload identity contract.

Decision:

- owner browser session: 8-hour absolute lifetime, 30-minute idle timeout, and 10-minute access token;
- client browser session: 12-hour absolute lifetime, 60-minute idle timeout, and 15-minute access token;
- recent authentication is valid for 10 minutes;
- service access token lifetime is at most 5 minutes, with per-service subject, audience, tenant scope where applicable, and explicit permission scopes;
- refresh tokens rotate on every use; detected reuse revokes the token family;
- owner bootstrap uses a one-time deployment ceremony and is disabled after the first assignment;
- owner registers at least two phishing-resistant authenticators and stores single-use recovery codes offline;
- recovery revokes all existing sessions, emits a high-severity external notification/audit event, and starts a 24-hour cooldown for critical actions;
- loss of every authenticator uses a two-custodian offline break-glass ceremony; custodians do not become active platform users;
- the sole owner may self-approve only reversible platform changes with recent authentication and a mandatory audit reason;
- emergency kill switches may be executed unilaterally because they reduce exposure;
- tenant-scoped high-risk actions require a `CLIENT_OWNER` approval plus recent authentication according to the action policy;
- irreversible global critical actions, including a second owner, audit destruction, or custody/money-movement enablement, remain disabled until an independent internal approver architecture is accepted;
- local/test identity simulation is allowed only through an explicit environment-gated adapter and synthetic principals.

Alternatives:

- allow every action to be self-approved by the sole owner: rejected because approval would be cosmetic;
- activate a second internal role during MVP: rejected because the owner-only scope is locked;
- use long-lived shared service API keys: rejected because revocation, attribution, and tenant scoping are weaker.

Consequences:

- authorization decisions must carry recent-auth, recovery-cooldown, approval, and self-approval data;
- actions without a valid Stage 1 approver fail closed or remain disabled;
- service identities cannot reuse browser or provider credentials;
- the external audit/notification and break-glass runbook remain production gates.

Security/privacy impact:

- reduces compromised-session duration and prevents silent owner recovery;
- preserves explicit accountability despite a single active internal role;
- avoids long-lived service secrets and cross-audience token reuse.

Migration/rollback:

- all values are versioned policy constants and may be tightened without session migration;
- loosening a limit or enabling a formerly disabled critical action requires ADR/security review.

Owner/date: Founder / Platform Owner and Technical Owner, 16 July 2026.

## New ADR Template

Title:

Status:

Context:

Decision:

Alternatives:

Consequences:

Security/privacy impact:

Migration/rollback:

Owner/date:
