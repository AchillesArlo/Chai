# Stage 2 Status

> Plan: `2026-07-19-stage-2-plan.md`
> Updated: 2026-07-20 loop 3 complete

## Board

| ID | Workstream | Status | Notes |
|---|---|---|---|
| S2-1 | API persistence | DONE | convos/leads/IAM/analytics/knowledge/payments/logistics Postgres; prod requires DATABASE_URL |
| S2-2 | Provider adapters | DONE | whatsapp-meta + google-calendar sandbox adapters + conformance |
| S2-3 | Durable automation | DONE | follow_up_job table + claim/complete/fail + runner + **restart-durability proof** |
| S2-4 | Knowledge production | DONE | knowledge_document table + Postgres repo + integration |
| S2-5 | Realtime + UI live data | DONE | gateway EventStore+bus, API publishes on ingest, client-portal SSE hook |
| S2-6 | Ops maturity | PARTIAL | runbooks (automation/knowledge/realtime) + monitoring dashboards/alerts; thresholds need load test |

## Loop 3 results (2026-07-20)

- W1 payments: migration 0010 + PostgresPaymentsRepository + factory + integration (6 tests)
- W2 logistics: migration 0011 + PostgresLogisticsRepository + factory + integration (3 tests)
- W3 automation: restart-durability integration test (job survives db.end()+reconnect) + API schedule endpoint
- Checker fix: widened `getJob` param to `Database | DatabaseTransaction` (test passed tx where Database expected)

## Full gate (2026-07-20)

- lint 21/21 · typecheck 21/21 · test 31/31
- integration: API 16/16 + worker 5/5 (incl restart-durability) + domain 29/29
- e2e 67/67 · smoke 3/3

## Production exit criteria (from plan)

- [x] Zero in-memory repositories in default NODE_ENV=production (DatabaseModule throws without DATABASE_URL)
- [ ] One real channel sandbox end-to-end in staging (needs staging env + Meta credentials — ops, not code)
- [x] Follow-up job survives process restart (restart-durability.integration.test.ts)
- [x] Stage 1 isolation suite still green (e2e 67 includes isolation + chaos)

## Remaining (ops, not code)

- Staging sandbox: Meta WhatsApp Business credentials + Graph API send wiring (whatsapp-meta sendMessage is dry-run)
- Google Calendar real OAuth (adapter is sandbox; serviceAccountJson path stubbed)
- Load test to tune S2-6 alert thresholds
- Temporal durable execution (S2-3 uses SKIP LOCKED claim loop — sufficient for single-instance; multi-instance needs distributed lock or Temporal)
