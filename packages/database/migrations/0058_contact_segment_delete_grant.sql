-- 0058_contact_segment_delete_grant.sql
-- D2: contact-segment gained a Postgres-backed repository. Its
-- DELETE /api/client/v1/contact-segments/:id path issues a real SQL DELETE, but
-- 0028 granted only SELECT/INSERT/UPDATE on chai.contact_segment, so the delete
-- would fail for the NOBYPASSRLS runtime roles (chai_api / chai_worker via their
-- group roles). Grant DELETE as well.
--
-- This does NOT weaken isolation: chai.contact_segment has ENABLE + FORCE ROW
-- LEVEL SECURITY with the tenant_isolation policy (0028), whose USING clause
-- applies to DELETE too, so a runtime role can only ever delete its own tenant's
-- rows. Granted under the table owner, matching 0028.

SET ROLE chai_migration_owner;

GRANT DELETE ON chai.contact_segment TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
