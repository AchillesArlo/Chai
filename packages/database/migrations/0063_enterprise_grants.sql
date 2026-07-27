-- 0063_enterprise_grants.sql
-- Fase 4.2 (rencana-100-persen): the enterprise module is gaining a
-- Postgres-backed repository, but 0019_enterprise.sql never granted the
-- runtime roles any privilege on its six tables. Grant the baseline CRUD the
-- repository needs.
--
-- DELETE is granted on chai.custom_role (deleteRole) and chai.role_assignment
-- (revokeRole issues a real DELETE); UPDATE is granted on chai.role_assignment
-- too because assignRole is an upsert (ON CONFLICT ... DO UPDATE) so Postgres
-- requires UPDATE privilege even though no plain UPDATE statement is issued.
-- The other four tables have no delete* method in EnterpriseRepository, so
-- DELETE is withheld there (least privilege). This module is
-- owner-console-only (RequirePermission 'platform.access.*' /
-- 'platform.audit.*' / 'platform.settings.*'), matching chai.sla_definition
-- (0027): only chai_app_runtime is granted, not chai_worker_runtime.
--
-- This does NOT weaken isolation: all six tables carry ENABLE + FORCE ROW
-- LEVEL SECURITY with a tenant_isolation policy from 0019, so a runtime role
-- can only ever read/write its own tenant's rows. Granted under the table
-- owner, matching every prior grants-only migration (e.g. 0058, 0062).

SET ROLE chai_migration_owner;

GRANT SELECT, INSERT, UPDATE ON chai.sso_configuration TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.scim_configuration TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.custom_role TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.role_assignment TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.audit_export_config TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.audit_export_history TO chai_app_runtime;

RESET ROLE;
