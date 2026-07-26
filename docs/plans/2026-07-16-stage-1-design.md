# Stage 1 MVP Validated Design

## Understanding Summary

- Build the entire Stage 1 MVP as incremental, runnable vertical slices.
- Core AI Customer Service is the critical path.
- Payment and logistics are optional vertical modules implemented after the core is stable.
- Initial external integrations use mock and sandbox adapters.
- Tenant isolation, server-side authorization, idempotency, reconciliation, audit, and observability are non-negotiable.
- The system remains a TypeScript modular monolith with independently deployable apps and workers.
- Every milestone includes contracts, persistence, UI states, tests, telemetry, and operational impact.

## Assumptions

- The initial engineering team is small enough that a modular monolith minimizes operational cost.
- Local development must work without production credentials.
- Exact dependency versions are pinned during bootstrap after current documentation and compatibility checks.
- Synthetic data is used in local, test, and staging unless explicitly approved otherwise.
- A critical gap blocks only the capabilities that depend on it; optional disabled modules do not block core launch.
- The workspace is not currently a Git repository, so commit checkpoints begin after repository initialization is explicitly approved.

## Selected Approach

Use contract-and-tenancy-first vertical slices.

Alternative approaches considered:

| Approach | Benefit | Rejected because |
|---|---|---|
| Horizontal layers | Clear database/API/UI phases | Product and integration feedback arrives too late |
| UI first | Fast visible demo | Mock contracts can violate tenancy and provider boundaries |
| Contract-and-tenancy-first vertical slices | Runnable increments with boundary tests | Selected; slightly more initial discipline is justified |

## Architecture

The monorepo uses pnpm workspaces and Turborepo. `apps/owner-console` and `apps/client-portal` are separate Next.js applications with separate authentication audiences and route guards. `apps/api` is a NestJS/Fastify modular monolith. `apps/realtime-gateway` owns Stage 1 SSE subscriptions and replay. Workers are separate process entry points but share domain and contract packages.

PostgreSQL owns business state, tenant/RLS enforcement, audit, inbox, outbox, idempotency, operation state, and realtime replay cursors. Redis owns BullMQ queues, locks, rate limits, cache, presence, and circuit state. Object storage holds media and documents by reference. External provider SDKs are confined to connector adapters.

Module reads use application/query ports. Module writes use commands or canonical events. Repositories are never imported across modules. The policy engine decides whether a tool is allowed; an action executor or durable workflow performs the tool call.

## Realtime Decision

Stage 1 uses Server-Sent Events for operational updates because the critical use cases are server-to-client. Each event has a versioned canonical envelope and sanitized payload. Reconnect uses `Last-Event-ID`. Events are replayed from a bounded persisted stream. A cursor outside retention or an irreconcilable version gap instructs the client to fetch a fresh snapshot.

WebSocket is deferred until a measured requirement cannot be satisfied by normal HTTP commands plus SSE, such as high-frequency bidirectional presence or widget transport constraints.

## Inbound and Outbox Flow

1. Public ingress validates method, size, signature, timestamp, replay window, and opaque provider account mapping.
2. Channel Edge persists a deduplicated inbox record and restricted raw reference in PostgreSQL.
3. The provider is acknowledged after commit, without waiting for AI or connector calls.
4. An inbox dispatcher claims records with a lease and publishes ordered queue references.
5. A worker reloads the inbox record and establishes trusted tenant context from persisted account ownership.
6. The worker writes canonical state, audit, metric event, and outbox in one transaction.
7. The outbox dispatcher claims and publishes at least once.
8. Consumers deduplicate by event ID and update downstream projections or replay streams.

## Idempotency and Operation State

HTTP commands use `Idempotency-Key`. Mutable aggregate commands also use `If-Match`; internal commands carry the same expected version.

The idempotency record stores audience, tenant, operation, key, request hash, status, response reference, and expiry. Operation statuses are:

- `PROCESSING`
- `SUCCEEDED`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`
- `UNKNOWN_RESULT`

The same key with a different request hash is rejected. A duplicate while processing returns the existing operation reference. `UNKNOWN_RESULT` cannot be retried until reconciliation reaches a known provider outcome.

## Authorization

Canonical client roles are Owner, Admin, Manager, Agent, Analyst, and Viewer. Roles map to a typed permission catalog. An authorization decision also evaluates audience, principal status, tenant membership, resource ownership, entitlement, object state/version, masking, approval, risk, and recent authentication.

Owner cross-tenant access always requires explicit tenant selection and a scoped context. Support access is modeled as a visible, time-bound grant rather than silent impersonation.

## Milestones

1. Foundation: toolchain, workspace, contracts, API envelope, database/RLS primitives, observability, local services, and test harness.
2. Identity and tenancy: audiences, local identity adapter, tenants, membership, roles, permissions, entitlements, owner context, and audit.
3. Channel and conversation: webhook simulator, channel accounts, inbox/outbox, contacts, identities, conversations, messages, attachments, and workers.
4. Operational inbox: assignment, takeover/resume, notes, SSE, Client Portal states, and customer context.
5. AI and knowledge: internal AI contract, mock/sandbox gateway, aliases, prompt releases, ingestion, hybrid RAG, evidence, tool policy, and evaluations.
6. Business outcomes: leads, qualification, Calendar adapter, booking, follow-up, consent, and channel-window guards.
7. Analytics and operations: semantic metric events, dashboards, usage/cost, queue/DLQ/replay, health, alerts, exports, and runbook integration.
8. Hardening and pilot: isolation suite, load/chaos, backup/restore, canary, kill switches, and synthetic design-partner fixtures.
9. Optional verticals: hosted payment orchestration, then read-only shipment tracking and exception handling, each behind an independent gate.

## Error Handling

The API error envelope contains a stable code, safe message, correlation ID, optional field details, retryability, and optional operation reference. Wrong-tenant resources return hidden `404`. Validation, authentication, policy, capability, and permanent provider errors are not automatically retried.

UI surfaces distinguish loading, empty, partial, stale, permission denied, retryable error, and final error. External provider data always displays source and freshness. Submit actions are disabled while the same command is processing.

## Testing Strategy

Production behavior is implemented through test-driven development. Required layers are schema/contract tests, domain and transition unit tests, PostgreSQL integration tests using real runtime roles, wrong-tenant matrices, adapter conformance tests, duplicate/out-of-order/timeout tests, accessibility/component tests, and Playwright critical-path tests.

Any tenant-isolation failure blocks release. Every external action is tested for duplicate submission, timeout after submit, reconciliation, stale expected version, and policy rejection.

## Decision Log

| Decision | Alternatives | Reason |
|---|---|---|
| Entire Stage 1, delivered incrementally | Single feature or big-bang MVP | Preserves full goal without delaying validation until the end |
| Core before vertical modules | Put payment/logistics on critical path | Matches optional entitlement model and reduces early risk |
| Mock and sandbox adapters first | Live providers immediately | Enables deterministic local and CI behavior |
| Vertical slices | Horizontal layers; UI first | Tests actual boundaries and creates runnable milestones |
| SSE first | WebSocket first; both immediately | Smaller Stage 1 surface with native reconnect |
| Transactional inbox dispatcher | Direct enqueue only; DB polling only | Durable recovery plus responsive processing |
| Explicit outbox dispatcher | Implicit worker publishing | Gives delivery semantics a clear owner |
| Separate operation state | Reuse domain error/status fields | Correctly represents uncertain external side effects |
| Typed permissions | Free-form role checks | Makes authorization testable and consistent |

## Open Decisions

- Independent approval and break-glass behavior for the single Platform Owner.
- Concrete session, recent-auth, recovery, and workload-identity parameters.
- Retention defaults and deletion propagation.
- Audit immutability and external integrity strategy.
- Exact KPI predicates and SLO measurement windows.
- Detailed payment and shipment state machines before their optional milestones.
