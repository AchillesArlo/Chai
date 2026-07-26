# Stage 1 Implementation Status

> Last updated: 2026-07-19 (Stage 1 automated gate closed)  
> Plan: `2026-07-16-stage-1-mvp.md`  
> Next: `2026-07-19-stage-2-plan.md`  
> Evidence: `docs/evidence/pilot-2026-07-19/`

## Legend

| Mark | Meaning |
|---|---|
| DONE | Implemented + tests green for the vertical slice |
| PARTIAL | Core path exists; secondary paths still open |
| TODO | Not started |
| DEFER | Explicitly deferred (ops evidence / env) |

---

## Task board

| Task | Title | Status | Notes |
|---:|---|---|---|
| 1 | Bootstrap and toolchain | DONE | |
| 2 | Contracts + testkit | DONE | |
| 3 | Database + RLS harness | DONE | integration green (Docker) |
| 4 | Auth / authorize | DONE | |
| 5 | API shell + health | DONE | |
| 6 | Owner + client shells + UI | DONE | smoke green |
| 7 | Inbox / outbox dispatchers | DONE | |
| 8 | Tenancy / IAM slice | DONE | |
| 9 | Channel / conversation | DONE | channel-worker |
| 10 | Operational inbox + SSE | DONE | assignment API |
| 11 | AI / knowledge / tools | DONE | knowledge + actions |
| 12 | Leads / booking / follow-up | DONE | calendar + automation-worker |
| 13 | Analytics / usage / ops | DONE | analytics API + analytics-worker |
| 14 | Harden pilot gate | DONE | automated gates green; load/soak/backup = runbook drills |
| 15 | Optional payment | DONE | mock-payment + API + payment-worker + UI `/payments` |
| 16 | Optional logistics | DONE | mock-shipping + API + logistics-worker + UI `/shipments` |
| 17 | Final verification | DONE | evidence under `docs/evidence/pilot-2026-07-19/` |

---

## Optional verticals (15–16)

### Payments
- Adapter: `@chai/connectors/mock-payment` (idempotent checkout, stop-on-paid, kill switch)
- API: `POST /api/client/v1/payments/checkout`, `GET .../:externalId`, webhook
- Worker: `workers/payment-worker` poll reconcile
- UI: `client-portal /payments`

### Logistics
- Adapter: `@chai/connectors/mock-shipping` (append-only timeline, tenant isolation)
- API: link / customer view / milestone inject
- Worker: `workers/logistics-worker` stale SLA helper
- UI: `client-portal /shipments`

---

## Workers inventory

| Worker | Role |
|---|---|
| inbox-dispatcher | claim → queue wake |
| outbox-dispatcher | publish external effects |
| channel-worker | inbound ingest (handler stub→payload) |
| automation-worker | follow-up re-check |
| payment-worker | checkout reconcile |
| logistics-worker | stale detection |
| media-worker | content-type classify |
| analytics-worker | metric fold |

---

## Verification (2026-07-19 pilot gate)

```text
pnpm lint                 → EXIT 0
pnpm typecheck            → EXIT 0
pnpm test                 → EXIT 0
pnpm test:integration     → EXIT 0 (database 26, domain 29, dispatchers 2+2)
pnpm --filter @chai/api test:e2e → 65 passed
pnpm test:smoke           → 3 passed
pnpm pilot:backup-drill   → EXIT 0 (scripted evidence JSON)
pnpm audit --prod         → 1 moderate (postcss via next; deferred per checklist)
```

Evidence logs: `docs/evidence/pilot-2026-07-19/`.

## Known limits (Stage 2 picks up)

- API still in-memory for most modules (domain isolation proven via Postgres integration)
- Worker handlers partially no-op until payload/job store
- Formal timed load/soak against live staging is ops, not CI — see `docs/runbooks/load-and-chaos.md`
- Stage 2 plan: `docs/plans/2026-07-19-stage-2-plan.md`
