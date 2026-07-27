-- 0068_retention_delete_grant.sql
-- Fase 5.2 (rencana-100-persen): the retention module is gaining a
-- Postgres-backed repository. 0040_public_table_rls.sql granted
-- SELECT/INSERT/UPDATE on public.retention_policies and public.retention_jobs
-- for chai_app_runtime, chai_worker_runtime, but RetentionRepository has a
-- deletePolicy method (a real DELETE) that 0040 never anticipated. Grant it.
--
-- public.retention_jobs has no delete* method (jobs are append-only history
-- once created), so it gets no new grant here.
--
-- This does NOT weaken isolation: public.retention_policies carries ENABLE +
-- FORCE ROW LEVEL SECURITY with a tenant_isolation policy (0040), so a
-- runtime role can only ever delete its own tenant's rows. Granted under the
-- table owner (matching 0040, which itself ran without SET ROLE because
-- 0029-0039 created these tables without SET ROLE chai_migration_owner).

GRANT DELETE ON public.retention_policies TO chai_app_runtime, chai_worker_runtime;
