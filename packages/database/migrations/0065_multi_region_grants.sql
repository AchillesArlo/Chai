-- 0065_multi_region_grants.sql
-- Fase 4.4 (rencana-100-persen): the multi-region module is gaining a
-- Postgres-backed repository, but 0021_multi_region.sql never granted the
-- runtime roles any privilege on its four tables.
--
-- DELETE is granted on chai.tenant_region (deleteTenantRegion) and
-- chai.region_routing_rule (deleteRoutingRule). UPDATE is granted on
-- chai.region_replication_status even though it has no plain UPDATE call
-- because upsertReplicationStatus is an upsert (ON CONFLICT ... DO UPDATE),
-- which Postgres treats as requiring UPDATE privilege too (same trap fixed in
-- 0063 for chai.role_assignment). chai.data_residency_audit has no delete* or
-- update* method (createResidencyAudit only appends), so it gets INSERT/SELECT
-- only — an audit log should not be app-writable to overwrite/delete anyway.
--
-- Owner-console-only (RequirePermission 'platform.tenant.*' on
-- api/owner/v1/multi-region); no worker touches these tables (verified: no
-- match in workers/**), so only chai_app_runtime is granted, matching
-- chai.sla_definition (0027).
--
-- This does NOT weaken isolation: all four tables carry ENABLE + FORCE ROW
-- LEVEL SECURITY with a tenant_isolation policy from 0021, so a runtime role
-- can only ever read/write its own tenant's rows. Granted under the table
-- owner, matching every prior grants-only migration (e.g. 0058, 0062-0064).

SET ROLE chai_migration_owner;

GRANT SELECT, INSERT, UPDATE, DELETE ON chai.tenant_region TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.region_routing_rule TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.region_replication_status TO chai_app_runtime;
GRANT SELECT, INSERT ON chai.data_residency_audit TO chai_app_runtime;

RESET ROLE;
