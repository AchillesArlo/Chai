-- 0069_connector_config_delete_grants.sql
-- Fase 5.3 (rencana-100-persen): the connector-config module is gaining a
-- Postgres-backed repository. 0040_public_table_rls.sql granted
-- SELECT/INSERT/UPDATE on public.connector_configs and public.connector_secrets
-- for chai_app_runtime, chai_worker_runtime, but ConnectorConfigRepository has
-- deleteConfig and deleteSecret (both real DELETEs) that 0040 never
-- anticipated. Grant them.
--
-- This does NOT weaken isolation:
--   - public.connector_configs carries ENABLE + FORCE ROW LEVEL SECURITY with
--     a direct tenant_isolation policy (tenant_id = chai.current_tenant_id()).
--   - public.connector_secrets carries ENABLE + FORCE ROW LEVEL SECURITY with
--     a parent-scoped policy (EXISTS ... connector_configs.tenant_id =
--     chai.current_tenant_id()), so a runtime role can only delete secrets
--     whose owning config belongs to its own tenant.
-- Granted under the table owner (matching 0040, which itself ran without SET
-- ROLE because 0029-0039 created these tables without SET ROLE
-- chai_migration_owner).

GRANT DELETE ON public.connector_configs TO chai_app_runtime, chai_worker_runtime;
GRANT DELETE ON public.connector_secrets TO chai_app_runtime, chai_worker_runtime;
