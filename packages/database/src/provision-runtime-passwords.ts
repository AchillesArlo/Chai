/**
 * Provisions the LOGIN passwords for chai_api / chai_worker after migration.
 *
 * Migration 0051 deliberately creates these roles WITHOUT a password (a
 * checksum-pinned migration file must never carry a credential). This script
 * is the out-of-band step its own comment describes, run once per compose
 * startup as chai_admin (the migration owner / bootstrap superuser).
 * Idempotent: ALTER ROLE ... PASSWORD always succeeds and simply (re)sets the
 * password to the current env value, so re-running on an already-provisioned
 * database is a no-op in effect.
 *
 * Usage: DATABASE_URL=<admin conn> CHAI_API_DB_PASSWORD=... CHAI_WORKER_DB_PASSWORD=... \
 *   pnpm --filter @chai/database exec tsx src/provision-runtime-passwords.ts
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const apiPassword = process.env.CHAI_API_DB_PASSWORD;
const workerPassword = process.env.CHAI_WORKER_DB_PASSWORD;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (!apiPassword || !workerPassword) {
  console.error('CHAI_API_DB_PASSWORD and CHAI_WORKER_DB_PASSWORD are required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
try {
  // ALTER ROLE ... PASSWORD does not accept a bind parameter for the password
  // literal; postgres.js has no helper for role DDL, so the value is escaped
  // via sql.unsafe with an explicit literal-escaping identifier substitution.
  // Passwords are provisioning-time env values (not user input), and this
  // runs only against the operator's own database.
  const escaped = (value: string) => `'${value.replace(/'/g, "''")}'`;
  await sql.unsafe(`ALTER ROLE chai_api PASSWORD ${escaped(apiPassword)}`);
  await sql.unsafe(`ALTER ROLE chai_worker PASSWORD ${escaped(workerPassword)}`);
  console.log('Runtime role passwords provisioned: chai_api, chai_worker');
} finally {
  await sql.end();
}
