# Runbook — Release Rollback

**Severity:** high when core API/realtime is broken  
**Owner:** release engineer

## Preconditions

- Immutable image/tag of last known good release
- Database migrations are backward-compatible for one release (Stage 1 rule)
- Backup/PITR health confirmed within threshold

## Steps

1. Stop progressive rollout / canary.
2. Redeploy previous image digests for:
   - `api`
   - `realtime-gateway`
   - workers (`inbox-dispatcher`, `outbox-dispatcher`)
   - owner-console / client-portal
3. Do **not** reverse a forward-only data migration without a written reverse plan.
4. Smoke:
   - `GET /health` on API and realtime
   - one synthetic webhook → conversation list
   - isolation suite smoke (`test:e2e`)

## Abort criteria for re-rollout

- Any isolation failure
- Elevated 5xx burn on API
- Inbox pending age > SLO threshold after restore

## Evidence

Record: previous version, new version, decision time, commander, smoke results.
