-- 0050: DB-driven active-tenant roster for the background workers (A3 upgrade).
--
-- Before this, every worker (outbox/inbox dispatcher, analytics harvester) read
-- its tenant roster from an env var (tenantId:principalId pairs). A newly
-- activated tenant was therefore invisible until a redeploy, so its outbox/inbox
-- events piled up undelivered. That is the debt this migration removes.
--
-- Workers run as chai_worker_runtime, which is NOBYPASSRLS, has NO SELECT grant
-- on chai.tenant, and is scoped to a single tenant by chai.tenant's
-- tenant_isolation policy (id = chai.current_tenant_id()). So a worker cannot
-- enumerate tenants on its own -- by design. This function is the ONE sanctioned
-- exception: a SECURITY DEFINER reader that returns only (active tenant, service
-- principal) and is executable ONLY by the worker role.
--
-- Definer = chai_migration_owner (the function's creator/owner). We deliberately
-- do NOT mint a separate owner role: that would require mutating cluster-level
-- role membership from a per-database migration, and the migrator test applies
-- every migration to an isolated probe database on the same cluster. The blast
-- radius is contained two other ways instead:
--   1. The function body is static SQL, takes no arguments, and pins search_path,
--      so it can never be coerced into anything but the single SELECT below.
--   2. PUBLIC is revoked and only chai_worker_runtime may EXECUTE it.
-- chai_migration_owner already owns every object in `chai` and serves no runtime
-- traffic, so using it as the definer grants no new runtime-reachable capability.

SET ROLE chai_migration_owner;

-- chai.tenant has ENABLE + FORCE ROW LEVEL SECURITY, so even the table owner
-- (chai_migration_owner) is filtered by policy. This narrow, owner-only,
-- SELECT-only, ACTIVE-only policy is what lets the SECURITY DEFINER body below
-- read the active-tenant list. It is OR-combined with the existing
-- tenant_isolation policy and is scoped TO chai_migration_owner alone, so tenant
-- isolation for chai_app_runtime / chai_worker_runtime / chai_analytics_reader is
-- unchanged.
CREATE POLICY tenant_roster_read ON chai.tenant
  FOR SELECT
  TO chai_migration_owner
  USING (status = 'ACTIVE');

CREATE FUNCTION chai.active_tenant_roster()
RETURNS TABLE (tenant_id uuid, principal_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    tenant.id AS tenant_id,
    -- Platform worker service principal. Background work is performed by the
    -- platform, not a human, so every active tenant shares this one well-known
    -- identity (the same modelling as @chai/domain's SERVICE_ACTOR_ID, but a
    -- distinct, valid UUIDv7 because principal ids are validated as v7 by
    -- withTenantTransaction / ActorIdSchema).
    -- ponytail: a per-tenant service principal (a column on chai.tenant or a
    -- service-account table) is the upgrade path if worker actions ever need
    -- per-tenant audit attribution; today one identity is correct and simplest.
    '00000000-0000-7000-8000-000000000001'::uuid AS principal_id
  FROM chai.tenant AS tenant
  WHERE tenant.status = 'ACTIVE'
  ORDER BY tenant.id
$$;

-- Default-deny: strip PUBLIC (0001 already revoked schema-wide; this is explicit
-- intent) and grant EXECUTE ONLY to the worker role. chai_app_runtime,
-- chai_analytics_reader and PUBLIC cannot call it, so this cross-tenant read is
-- reachable by the worker runtime alone.
REVOKE ALL ON FUNCTION chai.active_tenant_roster() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION chai.active_tenant_roster() TO chai_worker_runtime;

RESET ROLE;
