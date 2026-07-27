# Stage 3 Status

> Plan: `2026-07-20-stage-3-plan.md`
> Updated: 2026-07-20 Wave 1 + Wave 2 complete

> **Update 2026-07-27:** S3-2 "Temporal Durable Workflows" was **removed as dead code**
> (stub activities, zero callers, no production compose service). Payment/logistics
> reconciliation is done by the real, deployed `payment-worker` and `logistics-worker`.
> Durable-workflow adoption is deferred — see
> `docs/plans/2026-07-27-deferred-workers-roadmap.md`.

## Board

| ID | Workstream | Status | Notes |
|---|---|---|---|
| S3-1 | Real Channel Integration | DONE | WhatsApp Meta Graph API + Google Calendar OAuth + integration tests |
| S3-2 | Temporal Durable Workflows | REMOVED 2026-07-27 | Dead package (stub activities, zero callers) removed. Real reconciliation lives in payment-worker + logistics-worker. See deferred-workers-roadmap. |
| S3-3 | Audit Trail & RBAC | DONE | migration 0012 + audit module + middleware + owner-console UI |
| S3-4 | Production Deployment | DONE | staging + production docker-compose + deploy scripts + runbooks |
| S3-5 | Real Payment & Logistics | DONE | Midtrans Snap + JNE sandbox adapters + 21 tests |
| S3-6 | Test Coverage | DONE | E2E + performance + security test suites |

## Full Gate (2026-07-20)

- lint 22/22 · typecheck 22/22 · test 32/32
- integration 16/16 (API 21 + worker 5 + domain 29)
- e2e 67/67 · smoke 3/3

## What was done

### S3-1 Real Channel Integration
- `packages/connectors/src/connectors/whatsapp-meta/` — Graph API send + HMAC verification
- `packages/connectors/src/connectors/google-calendar/` — OAuth flow + Calendar API
- Integration tests: 19/19 green
- Docs: S3-1-whatsapp-meta.md, S3-1-google-calendar.md

### S3-2 Temporal Durable Workflows
> **Removed 2026-07-27 as dead code** — the package had stub activities and zero callers,
> and the real reconciliation runs in `payment-worker` + `logistics-worker`. Kept below for
> the historical record; see `docs/plans/2026-07-27-deferred-workers-roadmap.md`.
- ~~`workers/temporal/` — new package~~ (removed)
- 3 workflows: follow-up, payment-reconcile, logistics-poll
- 3 activities files with mock implementations
- Worker registration with graceful shutdown
- Docs: S3-2-temporal-workflows.md (retained, banner added), temporal-operations.md (removed)

### S3-3 Audit Trail & RBAC
- `packages/database/migrations/0012_audit_log.sql` — audit_log table + RLS
- `packages/domain/src/audit/` — AuditLog types + createAuditLog service
- `apps/api/src/modules/audit/` — controller + repository + module
- `apps/api/src/middleware/audit.middleware.ts` — audit interceptor
- `apps/owner-console/src/components/audit/` — AuditLogList + AuditLogDetail
- `apps/owner-console/src/app/audit/page.tsx` — audit log page

### S3-4 Production Deployment
- `infra/staging/` — docker-compose + nginx + .env.example
- `infra/production/` — docker-compose + nginx + postgres + sentinel + logstash
- `scripts/staging/deploy.sh` + `scripts/production/deploy.sh`
- `docs/runbooks/deployment.md`

### S3-6 Test Coverage
- `tests/e2e/` — conversation-flow, lead-booking, payment-flow, multi-tenant-isolation
- `tests/performance/` — api-load, data-benchmarks (skip by default, RUN_PERF_TESTS=true)
- `tests/security/` — rbac-enforcement, tenant-isolation, input-validation
- `docs/plans/S3-6-test-coverage.md`

## Remaining

- S3-5: Real Payment & Logistics (Midtrans + JNE) — optional, can defer to Stage 4
- Temporal removed 2026-07-27 (dead code); durable-workflow adoption deferred — see `docs/plans/2026-07-27-deferred-workers-roadmap.md`
- Real OAuth credentials needed for staging

## Stage 3 Exit Criteria

- [x] All S3-1 through S3-4, S3-6 complete
- [ ] S3-5 real payment/logistics (deferred)
- [x] All tests green
- [x] Documentation complete
- [x] Ready for Stage 4 (pending S3-5 decision)
