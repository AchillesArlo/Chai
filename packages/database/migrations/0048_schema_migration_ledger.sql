-- Deploy enablement (A1): the production migration ledger.
--
-- Until now the SQL migrations could only be applied by the testcontainers
-- global-setup loop, so there was no way to migrate a real database. The runner
-- in packages/database/src/migrator.ts fixes that, and this table is its ledger:
-- exactly one row per applied migration file.
--
-- The runner records (filename, checksum) in the SAME transaction that applies
-- the file, so a migration can never be applied without being recorded, and an
-- edit to an already-applied file is caught by a checksum mismatch and rejected.
--
-- Ownership follows the same rule as every other object in `chai`: created under
-- chai_migration_owner (the database-roles test asserts every chai table is owned
-- by that role). The runtime roles get NO privileges here -- recording migration
-- history is the migration owner's job, and a request- or worker-serving role
-- must never be able to forge or erase it. Default-deny is already in force via
-- 0001's REVOKE ALL ... FROM PUBLIC; the explicit REVOKE below documents intent.
--
-- No tenant_id: this is cluster/schema infrastructure, not tenant data, so it is
-- deliberately outside the RLS regime (the RLS-coverage guard only targets tables
-- carrying tenant_id).

SET ROLE chai_migration_owner;

CREATE TABLE chai.schema_migration (
  filename text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL
);

REVOKE ALL ON chai.schema_migration FROM PUBLIC;

RESET ROLE;
