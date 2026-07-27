-- 0066_partner_ecosystem_grants.sql
-- Fase 4.5 (rencana-100-persen): the partner-ecosystem module is gaining a
-- Postgres-backed repository, but 0022_partner_ecosystem.sql never granted
-- the runtime roles any privilege on its five tables.
--
-- chai.partner, chai.api_key and chai.rate_limit_usage are tenant-scoped
-- (ENABLE + FORCE ROW LEVEL SECURITY, tenant_isolation policy). chai.api_key
-- gets DELETE too because revokeApiKey issues a real DELETE (mirrors the
-- in-memory repository's Map.delete). chai.rate_limit_usage gets UPDATE
-- because incrementRateLimit is an upsert-by-window (INSERT ... ON CONFLICT
-- DO UPDATE), which requires UPDATE privilege even without a plain UPDATE
-- statement (same trap as 0063/0065).
--
-- chai.api_version and chai.sdk_release are deliberately NOT tenant-scoped —
-- they have no tenant_id column and no RLS policy at all (verified by reading
-- 0022 directly): a platform has exactly one API version registry, not one
-- per tenant. PartnerEcosystemRepository's methods for these two tables take
-- no tenantId for the same reason. Grants for them are unconditional (no RLS
-- to rely on).
--
-- Owner-console-only (RequirePermission 'platform.access.manage' on
-- api/owner/v1/partner-ecosystem); no worker touches these tables (verified:
-- no match in workers/**), so only chai_app_runtime is granted, matching
-- chai.sla_definition (0027).

SET ROLE chai_migration_owner;

GRANT SELECT, INSERT, UPDATE ON chai.partner TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.api_key TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.api_version TO chai_app_runtime;
GRANT SELECT, INSERT ON chai.sdk_release TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.rate_limit_usage TO chai_app_runtime;

RESET ROLE;
