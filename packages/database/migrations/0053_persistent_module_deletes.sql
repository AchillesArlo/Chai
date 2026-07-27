-- 0053: DELETE grants for the newly-persisted authoritative modules (D1).
--
-- WHY THIS EXISTS
-- The ai-agent, sla, and template repository contracts expose hard deletes
-- (deleteProfile, deleteToolPolicy, deleteDefinition, deleteTemplate) and the
-- client controllers surface DELETE endpoints for them. Their tables were
-- created in 0023/0027/0028 with SELECT/INSERT/UPDATE only, so the Postgres
-- repositories added in D1 would fail at runtime under the NOBYPASSRLS runtime
-- role. This grants the missing DELETE privilege -- and nothing more.
--
-- STILL TENANT-SAFE
-- These tables keep ENABLE + FORCE ROW LEVEL SECURITY with a tenant policy, and
-- the runtime roles remain NOBYPASSRLS, so a DELETE can only ever remove rows of
-- the caller's own tenant (the policy USING clause applies to DELETE). This is
-- the same posture 0001 already takes for chai.membership / chai.entitlement,
-- which are granted DELETE. Only chai_app_runtime is granted: these deletes are
-- driven by API endpoints, never by a background worker.

SET ROLE chai_migration_owner;

GRANT DELETE ON chai.agent_profile   TO chai_app_runtime;
GRANT DELETE ON chai.tool_policy     TO chai_app_runtime;
GRANT DELETE ON chai.sla_definition  TO chai_app_runtime;
GRANT DELETE ON chai.message_template TO chai_app_runtime;

RESET ROLE;
