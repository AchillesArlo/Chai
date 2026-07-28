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

### Backups — what actually runs

Production runs an **automated** logical backup: the `postgres-backup` service in
`infra/production/docker-compose.yml` runs `pg_dump` every `BACKUP_INTERVAL_SECONDS`
(default 3600s = hourly), writes gzipped dumps to the `postgres_backups` volume, and
prunes to the newest `BACKUP_RETENTION_COUNT` (default 48). It connects as
`POSTGRES_USER` (the schema owner) on purpose: tenant tables are FORCE RLS, so a
NOBYPASSRLS role would dump a *silently incomplete* database.

```bash
# Confirm backups are being produced
docker compose -f infra/production/docker-compose.yml logs -f postgres-backup
docker compose -f infra/production/docker-compose.yml exec postgres-backup ls -lt /backups | head
```

### RPO — the honest number

**RPO ≈ the WAL archive lag (seconds to `archive_timeout`, 60s by default), backed by
hourly base backups.** Two mechanisms run together:

1. **Base backups** — the `postgres-backup` service takes a scheduled logical `pg_dump`
   (default hourly, `BACKUP_INTERVAL_SECONDS`) into the `postgres_backups` volume.
2. **Continuous WAL archiving (PITR)** — `postgres.conf` sets `archive_mode = on` with an
   `archive_command` that copies every completed WAL segment into the
   `postgres_wal_archive` volume, plus `archive_timeout = 60s` so an idle database still
   bounds RPO instead of holding the tail in a partial segment.

A `pg_dump` alone would cap RPO at the dump interval — everything written after the last
dump is lost. Archiving the WAL alongside it lets recovery replay forward from a base
backup to any chosen point, which is what brings RPO down from ~1 hour to the archive lag.

Verify archiving is actually healthy (do this as part of go-live checks):

```bash
docker compose -f infra/production/docker-compose.yml exec -T postgres \
  psql -U chai_admin -d chai -c \
  "SELECT archived_count, last_archived_wal, failed_count, last_failed_wal FROM pg_stat_archiver;"
```

`failed_count` must be 0 and `last_archived_wal` must keep advancing. A rising
`failed_count` means the archive is broken and **RPO has silently fallen back to the
dump interval** — treat it as a paging incident, not a warning.

⚠️ The WAL archive volume must be prepared with the right ownership or every archive
fails with `Permission denied`: a fresh named volume is root-owned while postgres runs as
uid 70. The `postgres-wal-init` one-shot service handles this and postgres waits on it via
`depends_on: service_completed_successfully`. Do not remove it.

⚠️ The archive volume is local. A single-node volume protects against container loss, not
against host loss — ship both `postgres_backups` and `postgres_wal_archive` off-host
(object storage or a replica) before claiming disaster recovery.

### Point-in-time recovery (PITR)

Restores to an arbitrary timestamp using a base backup plus the archived WAL.

```bash
# 1. Stop writers so nothing races the restore.
docker compose -f infra/production/docker-compose.yml stop api client-portal owner-console \
  realtime-gateway channel-worker inbox-dispatcher outbox-dispatcher automation-worker \
  analytics-worker payment-worker logistics-worker

# 2. Restore the most recent base backup into a fresh database.
gunzip -c chai-chai-YYYYMMDD-HHMMSS.sql.gz | psql "$NEW_DATABASE_URL"

# 3. Replay WAL forward to the target time. On the data directory being recovered,
#    set the recovery target and point restore_command at the archive:
#      restore_command = 'cp /wal_archive/%f %p'
#      recovery_target_time = '2026-07-28 14:30:00+00'
#      recovery_target_action = 'promote'
#    then create the signal file and start postgres:
#      touch $PGDATA/recovery.signal
#
# 4. Confirm the replay reached the target before letting traffic in.
psql "$NEW_DATABASE_URL" -c "SELECT pg_is_in_recovery();"   # must be false after promote
```

Note that step 2 uses the logical dump, which is a *consistent snapshot* rather than a
physical base backup; replaying WAL on top of a logical restore is only valid if the dump
was taken with `--snapshot`/matching LSN bookkeeping. For strict PITR, take a **physical**
base backup instead:

```bash
docker compose -f infra/production/docker-compose.yml exec -T postgres \
  pg_basebackup -U chai_admin -D - -Ft -Xnone -z > base-$(date +%F-%H%M).tar.gz
```

Adopting `pg_basebackup` as the scheduled base backup (rather than `pg_dump`) is the
remaining step to a textbook PITR setup; the WAL side is in place and verified.

### On-demand backup (e.g. immediately before a migration)

```bash
docker compose -f infra/production/docker-compose.yml exec -T postgres \
  pg_dump -U chai_admin chai | gzip > backup-production-$(date +%F-%H%M).sql.gz
```

### Disaster Recovery Restore (RTO Target < 15 min)
```bash
gunzip -c chai-chai-YYYYMMDD-HHMMSS.sql.gz | psql "$NEW_DATABASE_URL"
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
