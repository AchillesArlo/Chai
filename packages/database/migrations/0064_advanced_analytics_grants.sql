-- 0064_advanced_analytics_grants.sql
-- Fase 4.3 (rencana-100-persen): the advanced-analytics module is gaining a
-- Postgres-backed repository, but 0020_advanced_analytics.sql never granted
-- the runtime roles any privilege on its six tables.
--
-- DELETE is granted on chai.analytics_dashboard (deleteDashboard),
-- chai.analytics_report (deleteReport) and chai.cohort_definition
-- (deleteCohort). chai.analytics_report_execution, chai.predictive_model and
-- chai.prediction_result have no delete* method in
-- AdvancedAnalyticsRepository, so DELETE is withheld (least privilege).
--
-- Client-facing only (RequirePermission 'analytics.read' / 'analytics.export'
-- on api/client/v1/advanced-analytics); no worker touches these tables
-- (verified: no match in workers/**), so only chai_app_runtime is granted,
-- matching chai.sla_definition (0027).
--
-- This does NOT weaken isolation: all six tables carry ENABLE + FORCE ROW
-- LEVEL SECURITY with a tenant_isolation policy from 0020, so a runtime role
-- can only ever read/write its own tenant's rows. Granted under the table
-- owner, matching every prior grants-only migration (e.g. 0058, 0062, 0063).

SET ROLE chai_migration_owner;

GRANT SELECT, INSERT, UPDATE, DELETE ON chai.analytics_dashboard TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.analytics_report TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.analytics_report_execution TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.predictive_model TO chai_app_runtime;
GRANT SELECT, INSERT ON chai.prediction_result TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.cohort_definition TO chai_app_runtime;

RESET ROLE;
