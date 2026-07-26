# Chai Platform — S9/S10 Go-Live & Kill Switch Runbook

> **Target Audience:** Ops / DevOps / On-Call Engineers
> **Updated:** 24 Juli 2026

---

## 1. Production Deployment Procedure (S9)

### Step 1: Infrastructure Provisioning (OpenTofu)
```bash
cd infra/opentofu
tofu init
tofu plan -var="environment=production" -out=tfplan
tofu apply tfplan
```

### Step 2: Seed Initial Runtime & Pilot Data
```bash
pnpm seed:api
node scripts/seed-pilot-data.ts
```

### Step 3: Launch Services & Workers

Bring the whole stack up through Docker Compose. This runs the one-shot
`migrate` service first (raw-SQL migrations), then the API, realtime gateway,
workers, and frontends with their health checks and per-service env
(`DATABASE_URL`, `REDIS_URL`, `AUTH_TOKEN_SECRET`, …). Do **not** `pnpm start`
services on the host: that bypasses migrations and the container env, and the
API refuses to boot without a valid `AUTH_TOKEN_SECRET`.

```bash
# From repo root, with infra/production/.env populated from .env.example
docker compose -f infra/production/docker-compose.yml up -d

# Follow rollout and confirm migrations applied cleanly
docker compose -f infra/production/docker-compose.yml logs -f migrate api
```

### Step 4: Run 72-Hour Soak Verification (S9)
```bash
pnpm pilot:soak
```

---

## 2. Emergency Kill-Switch Procedure (S6)

The platform supports a 3-tier runtime Kill Switch (`KillSwitchRuntime`):
1. **Environment Flag:** `KILL_SWITCH_<PROVIDER>=true`
2. **Owner Console Toggle:** Toggle via `/ai-operations` or `/marketplace` UI
3. **Database Flag:** Per-tenant disable in DB `tenancy.features`

### Triggering Provider Kill-Switch (CLI)

The env switch is per provider CLASS, not per vendor. `KillSwitchRuntime` reads
`KILL_SWITCH_<PROVIDER>` where `<PROVIDER>` is one of `PAYMENT`, `CHANNEL`,
`LOGISTICS`, `CALENDAR`, and trips on `1` or `true`
(`packages/connectors/src/kill-switch.ts:58`). There is no per-vendor suffix —
e.g. `KILL_SWITCH_PAYMENT_MIDTRANS` is never read.

```bash
# Disable ALL payment connectors (e.g. Midtrans)
export KILL_SWITCH_PAYMENT=true

# Disable ALL channel connectors (e.g. WhatsApp Meta)
export KILL_SWITCH_CHANNEL=true
```

---

## 3. Disaster Recovery & Backup Restore Procedure (S10)

### Database Backup Execution (RPO Target < 5 min)
```bash
pg_dump $DATABASE_URL > backup-production-$(date +%F-%H%M).sql
```

### Disaster Recovery Restore (RTO Target < 15 min)
```bash
psql $NEW_DATABASE_URL < backup-production-2026-07-24-1200.sql
pnpm pilot:backup-drill
```

---

## 4. Stage Gate Sign-Off Checklist
- [x] S1: E2E Frontend ↔ Realtime ↔ Worker Chain Verified (<3s SLA)
- [x] S2: Connector Staging Activation Verified (Midtrans, WA Meta, JNE, GCal)
- [x] S3: Load Test Verified (100 agents, 1k msg/min burst)
- [x] S4: Chaos Test Verified (Worker kill, DB/Redis disconnect)
- [x] S5: Pentest & Security Audit Verified (0 vulnerabilities)
- [x] S6: Kill Switch Runbook Documented & Verified
- [x] S7: Pilot Data Seeded
- [x] S8: Gate Verification Suite Executed Cleanly (`npm run pilot:gate`)
- [x] S9: 72h Production Soak Test Verification Report Generated (`09-production-soak-test.json`)
- [x] S10: DR Backup & Restore Drill Evidence Recorded (`10-dr-drill-report.json`)
