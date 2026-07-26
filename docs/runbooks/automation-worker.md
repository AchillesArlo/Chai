# Runbook — Automation Worker (durable follow-ups)

**Severity:** high when follow-up backlog grows or leads age without action
**Owner:** automation on-call

## Overview

The automation worker drains `chai.follow_up_job` for the tenants in the live
roster from `chai.active_tenant_roster()` (re-read each cycle, so a newly
activated tenant is picked up without a redeploy). The legacy
`AUTOMATION_TENANT_ROSTER` env is **obsolete and rejected at startup** — setting
it makes the worker throw (`packages/database/src/tenant-roster-loop.ts`). Each
poll (default `AUTOMATION_POLL_INTERVAL_MS=1000`):

1. `claimDueJobs` — `UPDATE ... SET status='CLAIMED'` for `PENDING` rows whose
   `due_at <= now()`, ordered by `due_at`, `FOR UPDATE SKIP LOCKED`.
2. Runs the follow-up handler per job.
3. `completeJob` on success (`status='DONE'`, `last_error=NULL`).
4. `failJob` on throw — increments `attempt`; sets `status='FAILED'` once
   `attempt + 1 >= max_attempts`, else back to `PENDING`.

Status machine: `PENDING → CLAIMED → DONE | FAILED` (FAILED is terminal unless
manually reset; PENDING is the retry path).

## Failure modes

- **Job stuck CLAIMED** — runner crashed mid-handle after claim, before
  complete/fail. Job never returns to PENDING on its own. Symptom: a lead's
  follow-up never fires and the row sits in CLAIMED past `due_at`.
- **FAILED exhaustion** — `attempt >= max_attempts`; handler keeps throwing.
  `last_error` holds the most recent message. Terminal without operator action.
- **Runner not draining** — pod down, an empty active-tenant roster, or DB
  connectivity lost. PENDING backlog climbs, `due_at` ages.
- **Handler no-op** — `# ponytail:` the default handler logs and completes
  without side effects until S2-4 AI tool wiring lands. A DONE job that did
  nothing is expected pre-S2-4, not a bug.

## Triage commands

```sql
-- Queue depth by status (whole tenant or all)
SELECT status, count(*) AS n
FROM chai.follow_up_job
GROUP BY status
ORDER BY n DESC;

-- Backlog: PENDING jobs past due_at (oldest first)
SELECT id, tenant_id, conversation_id, due_at, attempt, max_attempts,
       now() - due_at AS overdue_by
FROM chai.follow_up_job
WHERE status = 'PENDING' AND due_at <= now()
ORDER BY due_at
LIMIT 50;

-- Stuck CLAIMED jobs (runner crash suspects)
SELECT id, tenant_id, conversation_id, due_at, attempt,
       now() - updated_at AS claimed_for
FROM chai.follow_up_job
WHERE status = 'CLAIMED'
ORDER BY updated_at
LIMIT 50;

-- Recent FAILED jobs with their last error
SELECT id, tenant_id, conversation_id, attempt, max_attempts,
       last_error, updated_at
FROM chai.follow_up_job
WHERE status = 'FAILED'
ORDER BY updated_at DESC
LIMIT 50;
```

Confirm the runner is alive: process up, logs show `automation worker` polling,
and the affected `tenant_id` is ACTIVE in `chai.active_tenant_roster()`.

## Recovery

### Stuck CLAIMED → back to PENDING (runner crashed)

Reset rows that have been CLAIMED longer than a safe threshold (e.g. 5 min —
longer than any legitimate handler run). Bump nothing else; the next poll
re-claims and re-runs.

```sql
-- Reset stale CLAIMED jobs for one tenant
UPDATE chai.follow_up_job
SET status = 'PENDING', updated_at = now()
WHERE tenant_id = '<tenant-uuid>'
  AND status = 'CLAIMED'
  AND updated_at < now() - interval '5 minutes';
```

### FAILED → retry once root cause is fixed

Reset a single FAILED job: drop `attempt` back so the next failure still has
retries, clear `last_error`, return to PENDING.

```sql
UPDATE chai.follow_up_job
SET status = 'PENDING', attempt = 0, last_error = NULL, updated_at = now()
WHERE id = '<job-uuid>' AND status = 'FAILED';
```

Bulk reset for a tenant (use sparingly — confirms root cause first):

```sql
UPDATE chai.follow_up_job
SET status = 'PENDING', attempt = 0, last_error = NULL, updated_at = now()
WHERE tenant_id = '<tenant-uuid>' AND status = 'FAILED';
```

## SLO

Follow-up latency: time from `due_at` to `DONE.updated_at`.
Target p95 < 60s once a healthy runner is polling. `# ponytail:` real p95/p99
numbers pending the Stage 2 load test — wire `chai_follow_up_job_latency_seconds`
histogram before publishing SLO numbers.

## Abort / escalate

- Stop resetting FAILED jobs if `last_error` is the same string across rows —
  that's a handler bug, not a transient failure. Page the S2-4 owner.
- If PENDING backlog > 100 sustained (see `FollowUpJobBacklogHigh` alert), scale
  the worker or shorten `AUTOMATION_POLL_INTERVAL_MS` before more resets.

## Evidence

Record: incident time, tenant, job IDs touched, counts reset, runner pod, root
cause, whether S2-4 handler was wired at the time.
