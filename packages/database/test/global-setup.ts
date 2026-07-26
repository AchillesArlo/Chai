import { join } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

import { runMigrations } from '../src/migrator';

const ROLE_PASSWORDS = {
  chai_analytics_reader: 'synthetic-analytics-password',
  // Production LOGIN roles created by migration 0051 (members of the runtime
  // group roles). These are the path production actually connects on, so the
  // suite exercises them directly. chai_admin (superuser) is used ONLY to seed.
  chai_api: 'synthetic-api-login-password',
  chai_app_runtime: 'synthetic-runtime-password',
  chai_migration_owner: 'synthetic-migration-owner-password',
  chai_worker: 'synthetic-worker-login-password',
  chai_worker_runtime: 'synthetic-worker-password',
} as const;

function databaseUrlForRole(
  adminDatabaseUrl: string,
  role: keyof typeof ROLE_PASSWORDS,
): string {
  const databaseUrl = new URL(adminDatabaseUrl);
  databaseUrl.username = role;
  databaseUrl.password = ROLE_PASSWORDS[role];
  return databaseUrl.toString();
}

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:17.6-alpine')
    .withDatabase('chai_test')
    .withPassword('synthetic-admin-password')
    .withUsername('chai_test_admin')
    .start();

  const adminDatabaseUrl = container.getConnectionUri();
  const migrationsDirectory = join(process.cwd(), 'migrations');

  // Run the SAME migration runner that ships to production, so the path the
  // integration suite exercises is the deploy path (not a test-only loop).
  await runMigrations({ databaseUrl: adminDatabaseUrl, migrationsDirectory });

  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin.unsafe(
      `ALTER ROLE chai_migration_owner LOGIN PASSWORD '${ROLE_PASSWORDS.chai_migration_owner}'`,
    );
    await admin.unsafe(
      `ALTER ROLE chai_app_runtime LOGIN PASSWORD '${ROLE_PASSWORDS.chai_app_runtime}'`,
    );
    await admin.unsafe(
      `ALTER ROLE chai_worker_runtime LOGIN PASSWORD '${ROLE_PASSWORDS.chai_worker_runtime}'`,
    );
    await admin.unsafe(
      `ALTER ROLE chai_analytics_reader LOGIN PASSWORD '${ROLE_PASSWORDS.chai_analytics_reader}'`,
    );
    // chai_api / chai_worker are already LOGIN (migration 0051); set the
    // synthetic password so the suite can connect on the production path.
    await admin.unsafe(
      `ALTER ROLE chai_api LOGIN PASSWORD '${ROLE_PASSWORDS.chai_api}'`,
    );
    await admin.unsafe(
      `ALTER ROLE chai_worker LOGIN PASSWORD '${ROLE_PASSWORDS.chai_worker}'`,
    );
  } finally {
    await admin.end();
  }

  project.provide('adminDatabaseUrl', adminDatabaseUrl);
  project.provide(
    'analyticsDatabaseUrl',
    databaseUrlForRole(adminDatabaseUrl, 'chai_analytics_reader'),
  );
  project.provide(
    'migrationOwnerDatabaseUrl',
    databaseUrlForRole(adminDatabaseUrl, 'chai_migration_owner'),
  );
  project.provide(
    'runtimeDatabaseUrl',
    databaseUrlForRole(adminDatabaseUrl, 'chai_app_runtime'),
  );
  project.provide(
    'workerDatabaseUrl',
    databaseUrlForRole(adminDatabaseUrl, 'chai_worker_runtime'),
  );
  // The PRODUCTION connection path: NOBYPASSRLS LOGIN roles (migration 0051),
  // members of the runtime group roles above. Distinct from chai_admin.
  project.provide(
    'apiLoginDatabaseUrl',
    databaseUrlForRole(adminDatabaseUrl, 'chai_api'),
  );
  project.provide(
    'workerLoginDatabaseUrl',
    databaseUrlForRole(adminDatabaseUrl, 'chai_worker'),
  );

  return async () => {
    await container.stop();
  };
}
