import { fileURLToPath } from 'node:url';

import { runMigrations } from './migrator';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Point it at a role that owns the chai schema ' +
        '(the migration owner) or a superuser, then re-run.',
    );
  }

  // migrations/ sits next to src/, independent of the process working directory.
  const migrationsDirectory = fileURLToPath(
    new URL('../migrations', import.meta.url),
  );

  const result = await runMigrations({
    databaseUrl,
    logger: {
      info: (message: string): void => {
        console.log(message);
      },
    },
    migrationsDirectory,
  });

  console.log(
    `Migrations finished: ${String(result.applied.length)} applied, ` +
      `${String(result.skipped.length)} already present.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
