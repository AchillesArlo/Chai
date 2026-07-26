# Runbook — Suspected Cross-Tenant Exposure

**Severity:** page immediately  
**Owner:** on-call platform

## Detect

- Alert `SuspectedCrossTenantExposure`
- Isolation e2e failure in CI (`apps/api/test/isolation`, `apps/realtime-gateway/test/isolation`)
- Customer report of foreign data

## Contain (first 15 minutes)

1. Freeze releases: block main deploys.
2. Enable global read-only kill switch if available; otherwise scale API/realtime to zero write paths.
3. Capture correlation IDs, tenant IDs, request paths, and actor principals.
4. Preserve audit logs and database snapshots (do not truncate).

## Diagnose

1. Re-run isolation suite:
   - `pnpm --filter @chai/api test:e2e`
   - `pnpm --filter @chai/realtime-gateway test:e2e`
   - `pnpm --filter @chai/database test:integration`
2. Check RLS session GUCs and runtime role (must not be table owner / BYPASSRLS).
3. Inspect recent migrations and repository changes for missing `tenant_id` filters.

## Mitigate

1. Patch the shared authorization/RLS boundary (not per-route band-aids).
2. Re-run full isolation matrix before reopening writes.
3. Notify affected tenants with confirmed scope only.

## Close

1. Postmortem within 48h.
2. Add regression test for the exact leak path.
3. Keep isolation defect as release blocker forever (GAP-013 / DEC-010).
