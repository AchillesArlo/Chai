-- 0062_observability_grants.sql
-- Fase 4.1 (rencana-100-persen): the observability module is gaining a
-- Postgres-backed repository, but 0018_observability.sql never granted the
-- runtime roles any privilege on its five tables — chai_app_runtime cannot
-- even SELECT them today. Grant the baseline CRUD the repository needs.
--
-- No DELETE: ObservabilityRepository has no delete* method, so none is granted
-- (least privilege). This module is owner-console-only (RequirePermission
-- 'platform.reliability.*'), matching chai.sla_definition (0027), which grants
-- only chai_app_runtime and not chai_worker_runtime.
--
-- This does NOT weaken isolation: all five tables carry ENABLE + FORCE ROW
-- LEVEL SECURITY with a tenant_isolation policy from 0018, so a runtime role
-- can only ever read/write its own tenant's rows. Granted under the table
-- owner, matching every prior grants-only migration (e.g. 0058).

SET ROLE chai_migration_owner;

GRANT SELECT, INSERT, UPDATE ON chai.service_level_indicator TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.error_budget TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.incident TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.runbook TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.runbook_execution TO chai_app_runtime;

RESET ROLE;
