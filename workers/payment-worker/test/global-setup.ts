import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

const ROLE_PASSWORDS = {
  chai_analytics_reader: 'synthetic-analytics-password',
  chai_app_runtime: 'synthetic-runtime-password',
  chai_migration_owner: 'synthetic-migration-owner-password',
  chai_worker_runtime: 'synthetic-worker-password',
} as const;

// ponytail: same DB test bootstrap as the other worker/domain suites. The shared
// @chai/database/testing harness is still owed; extract on the next change here.
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
    .withDatabase('chai_worker_payment_test')
    .withPassword('synthetic-admin-password')
    .withUsername('chai_worker_payment_admin')
    .start();

  const adminDatabaseUrl = container.getConnectionUri();
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDirectory = join(here, '../../../packages/database/migrations');
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    for (const migrationFile of migrationFiles) {
      const migration = await readFile(
        join(migrationsDirectory, migrationFile),
        'utf8',
      );
      await admin.unsafe(migration);
    }
    for (const role of Object.keys(ROLE_PASSWORDS) as Array<
      keyof typeof ROLE_PASSWORDS
    >) {
      await admin.unsafe(
        `ALTER ROLE ${role} LOGIN PASSWORD '${ROLE_PASSWORDS[role]}'`,
      );
    }
  } finally {
    await admin.end();
  }

  project.provide('adminDatabaseUrl', adminDatabaseUrl);
  project.provide(
    'workerDatabaseUrl',
    databaseUrlForRole(adminDatabaseUrl, 'chai_worker_runtime'),
  );

  return async () => {
    await container.stop();
  };
}
