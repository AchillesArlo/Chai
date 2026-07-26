import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

const ROLE_PASSWORDS = {
  chai_app_runtime: 'runtime_pw',
  chai_worker_runtime: 'worker_pw',
  chai_analytics_reader: 'analytics_pw',
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
    .withDatabase('chai_automation_test')
    .start();

  const adminDatabaseUrl = container.getConnectionUri();
  const admin = postgres(adminDatabaseUrl, { max: 10 });

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, '..', '..', '..', 'packages', 'database', 'migrations');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  try {
    for (const file of files) {
      const sqlText = await readFile(join(migrationsDir, file), 'utf8');
      await admin.unsafe(sqlText);
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
