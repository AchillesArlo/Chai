# Load, burst, soak, Redis-loss

> Stage 1 pilot drills. Run against staging synthetic tenants only.

## Prerequisites

- Compose stack healthy (`infra/compose/docker-compose.yml`)
- Synthetic tenant roster seeded
- Kill switches reachable for payment/logistics modules

## Load / burst

```bash
# example k6 / vegeta placeholders — replace with measured SLOs before pilot
# pnpm exec k6 run scripts/load/webhook-burst.js
```

Record: p95 webhook accept latency, inbox claim lag, outbox publish lag.

## Soak

Run continuous synthetic inbound for ≥4h. Watch:

- lease reclaim rate
- DLQ growth
- connection pool saturation

## Redis loss

1. Stop Redis container.
2. Confirm API still accepts writes (Postgres authoritative).
3. Confirm workers claim from DB lease path.
4. Restore Redis; confirm queues rebuild without duplicate side effects.

## Backup / restore

See `docs/runbooks/rollback.md`. After restore, re-run isolation e2e:

```bash
pnpm --filter @chai/api test:e2e
pnpm test:integration
```

## Evidence package

Store under `docs/evidence/pilot-<date>/`:

- isolation/chaos e2e log
- soak summary
- Redis-loss notes
- dependency audit
- accessibility smoke
