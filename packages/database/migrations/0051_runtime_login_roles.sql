-- 0051: dedicated LOGIN roles for runtime connections (C2 tenant-isolation fix).
--
-- WHY THIS EXISTS
-- README invariant: "role runtime NOBYPASSRLS". The role DEFINITIONS in 0001 are
-- correct -- chai_app_runtime / chai_worker_runtime are NOBYPASSRLS -- but they
-- are NOLOGIN GROUP roles, so nothing can actually connect AS them. Production
-- and staging therefore fell back to POSTGRES_USER (default chai_admin), the
-- bootstrap SUPERUSER, for the api and every worker. A superuser bypasses RLS
-- unconditionally, so FORCE ROW LEVEL SECURITY + USING(false) still returned
-- every tenant's rows: tenant isolation was OFF on the only connection path
-- production used, even though the RLS suite was green (it connected as
-- chai_app_runtime -- a path production never took).
--
-- THE FIX
-- Two LOGIN roles that are MEMBERS of the existing runtime group roles and are
-- themselves NOSUPERUSER / NOBYPASSRLS:
--   chai_api    -> member of chai_app_runtime    (the NestJS API)
--   chai_worker -> member of chai_worker_runtime  (every background worker)
-- With INHERIT they automatically use their group's table/function GRANTs, so no
-- application code changes: withTenantTransaction keeps setting app.tenant_id and
-- the connection role does the RLS enforcement. Because the login role is
-- NOBYPASSRLS and is NOT the table owner, RLS (and FORCE RLS) is enforced on it.
-- Compose now points the api/worker DATABASE_URL at these roles; only the
-- one-shot `migrate` service keeps using the owner/superuser (its job is DDL).
--
-- PASSWORDS ARE NOT SET HERE, ON PURPOSE
-- Migrations are immutable (checksum-pinned in chai.schema_migration) and live in
-- git, so they must never carry a credential. The roles are created WITHOUT a
-- password; the operator provisions one out-of-band from the secrets manager
-- after the first migrate, e.g.:
--   ALTER ROLE chai_api    PASSWORD '<CHAI_API_DB_PASSWORD>';
--   ALTER ROLE chai_worker PASSWORD '<CHAI_WORKER_DB_PASSWORD>';
-- Until a password is set the role cannot authenticate under scram-sha-256, so
-- the default is fail-closed (a passwordless role cannot log in). The integration
-- harness sets synthetic passwords the same way, in
-- packages/database/test/global-setup.ts.
--
-- APPLIED BY THE MIGRATION AUTHORITY (superuser / CREATEROLE)
-- CREATE ROLE and altering NOSUPERUSER/NOBYPASSRLS require a superuser (or, for
-- CREATE ROLE alone, CREATEROLE). The migrate service already runs as the
-- bootstrap superuser, which satisfies this. Roles are cluster-global, and the
-- migrator test replays every migration against an isolated probe database on the
-- SAME cluster, so each statement below is written to be idempotent (the roles
-- may already exist from the primary database's run) -- exactly as 0001 does.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chai_api') THEN
    CREATE ROLE chai_api LOGIN INHERIT
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chai_worker') THEN
    CREATE ROLE chai_worker LOGIN INHERIT
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- Belt-and-suspenders: if either role somehow pre-existed with laxer attributes
-- (e.g. an operator hand-created chai_api as a superuser before migrating), force
-- the security-critical ones. NOBYPASSRLS is the entire point of this migration;
-- NOSUPERUSER guarantees the runtime connection can never bypass RLS. These are
-- no-ops on the freshly created roles above.
ALTER ROLE chai_api    NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE chai_worker NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Membership grants the least-privilege runtime privileges defined in 0001/0050.
-- WITH INHERIT TRUE is explicit (not merely relying on the member's rolinherit)
-- so the login role uses its group's object GRANTs automatically -- no SET ROLE
-- required in application code. It does NOT inherit role ATTRIBUTES: chai_api
-- stays NOBYPASSRLS regardless of the group definition.
GRANT chai_app_runtime    TO chai_api    WITH INHERIT TRUE;
GRANT chai_worker_runtime TO chai_worker WITH INHERIT TRUE;
