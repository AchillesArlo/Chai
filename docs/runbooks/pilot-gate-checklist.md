# Stage 1 Core Pilot Gate Checklist

Evidence must be recorded. Unit tests alone do not close the gate.

Evidence package: `docs/evidence/pilot-2026-07-19/` (2026-07-19)

## Required (blocking)

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm test:integration` (Docker engine available)
- [x] `pnpm test:e2e` (includes isolation + chaos) — `@chai/api` 65 passed
- [x] Zero open isolation defects
- [x] Compose stack present: `infra/compose/docker-compose.yml`
- [x] OpenTofu skeleton present under `infra/opentofu`
- [x] Monitoring skeleton present under `infra/monitoring`
- [x] Runbooks present under `docs/runbooks`
- [x] Playwright smoke (`pnpm test:smoke` — 3 passed)

## Deferred / scheduled (not CI-blocking for local pilot)

- [ ] Load / burst / soak against live staging API
- [ ] Redis loss drill (live)
- [ ] Backup restore exercise (actual RPO/RTO on staging DB)
- [ ] Secret scanning + high dependency audit on release branch
- [x] Playwright UI smoke journeys (audience shells)
- [ ] Production `next build` on Windows (known hang; use Linux CI/container)

Note: `pnpm audit --prod` reports 1 moderate (postcss via next). Track on release branch; not Stage 1 code-gate blocking.

## Optional modules (do not block core)

- Payment vertical (Task 15) — DONE (mock adapter + gate tests)
- Logistics vertical (Task 16) — DONE (mock adapter + gate tests)
