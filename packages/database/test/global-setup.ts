import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

const ROLE_PASSWORDS = {
  chai_analytics_reader: 'synthetic-analytics-password',
  chai_app_runtime: 'synthetic-runtime-password',
  chai_migration_owner: 'synthetic-migration-owner-password',
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

  return async () => {
    await container.stop();
  };
}
