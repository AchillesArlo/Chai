import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import postgres from 'postgres';

/** Minimal logger surface, so a caller can pass `console` or a real logger. */
export interface MigrationLogger {
  info: (message: string) => void;
}

export interface RunMigrationsOptions {
  databaseUrl: string;
  logger?: MigrationLogger;
  migrationsDirectory: string;
}

export interface MigrationRunResult {
  /** Files applied for the first time during this run, in filename order. */
  applied: string[];
  /** Files already present in the ledger and therefore skipped. */
  skipped: string[];
}

/**
 * Advisory-lock namespace for Chai schema migrations. Two 32-bit keys (spelling
 * "CHAI" / "MIGR") select the pg_advisory_lock(int, int) overload, so plain JS
 * numbers bind without needing BigInt. Two instances starting at once serialize
 * on this lock, so migrations are never applied twice in parallel.
 */
const MIGRATION_LOCK_KEY_1 = 0x43_48_41_49; // "CHAI"
const MIGRATION_LOCK_KEY_2 = 0x4d_49_47_52; // "MIGR"

function sha256(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

async function ledgerExists(tx: postgres.TransactionSql): Promise<boolean> {
  // to_regclass returns NULL (it never throws) when the relation -- or even its
  // schema -- does not exist yet, so this is safe during bootstrap before 0001
  // has created the `chai` schema.
  const [row] = await tx<{ present: boolean }[]>`
    SELECT to_regclass('chai.schema_migration') IS NOT NULL AS present
  `;
  return row?.present ?? false;
}

async function recordMigration(
  tx: postgres.TransactionSql,
  filename: string,
  checksum: string,
): Promise<void> {
  // applied_by is the database role that ran the migration. ON CONFLICT DO
  // NOTHING keeps the bootstrap flush below safe; genuine drift is caught
  // earlier by the checksum comparison, never masked here.
  await tx`
    INSERT INTO chai.schema_migration (filename, checksum, applied_by)
    VALUES (${filename}, ${checksum}, current_user::text)
    ON CONFLICT (filename) DO NOTHING
  `;
}

/**
 * Apply every `*.sql` file in `migrationsDirectory` (sorted by filename) to the
 * database at `databaseUrl`, exactly once, recording each in the
 * `chai.schema_migration` ledger.
 *
 * Guarantees:
 * - An advisory lock serializes concurrent runners (released in `finally`).
 * - Each file is applied AND recorded in a single transaction, so a migration
 *   can never be applied without being recorded.
 * - Editing an already-applied file is rejected (checksum mismatch).
 * - Idempotent: a second run against an up-to-date database is a no-op.
 */
export async function runMigrations(
  options: RunMigrationsOptions,
): Promise<MigrationRunResult> {
  const { databaseUrl, logger, migrationsDirectory } = options;

  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  // max: 1 keeps every statement below on a single backend connection, so the
  // session-level advisory lock taken next is held for the whole run and can be
  // released on that same connection in the finally block.
  const sql = postgres(databaseUrl, { max: 1 });

  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY_1}::int, ${MIGRATION_LOCK_KEY_2}::int)`;

    try {
      // Bootstrap: on a fresh database the ledger does not exist until 0048
      // creates it, yet 0048 lives in the `chai` schema that 0001 creates, so it
      // cannot exist any earlier. We therefore apply files while the ledger is
      // absent and buffer them here, then record the whole buffer inside the very
      // transaction that first creates the ledger. A from-zero run still ends
      // with every file recorded, and the record stays atomic with 0048's DDL.
      // ponytail: the 0001..0048 bootstrap window is all-or-nothing on a fresh DB
      // (these migrations are not individually idempotent); recover a failed
      // fresh migrate by recreating the database, then re-run.
      const pendingBootstrap: { checksum: string; filename: string }[] = [];

      for (const filename of files) {
        const contents = await readFile(
          join(migrationsDirectory, filename),
          'utf8',
        );
        const checksum = sha256(contents);
        let wasSkipped = false;

        await sql.begin(async (tx) => {
          if (await ledgerExists(tx)) {
            const [recorded] = await tx<{ checksum: string }[]>`
              SELECT checksum
              FROM chai.schema_migration
              WHERE filename = ${filename}
            `;

            if (recorded) {
              if (recorded.checksum !== checksum) {
                throw new Error(
                  `Migration ${filename} was already applied with checksum ` +
                    `${recorded.checksum} but the file now hashes to ${checksum}. ` +
                    `Applied migrations are immutable -- revert the edit to ` +
                    `${filename} and add a new migration instead.`,
                );
              }
              wasSkipped = true;
              return; // idempotent no-op: already applied and unchanged
            }
          }

          // Apply the migration, then record it in the SAME transaction.
          await tx.unsafe(contents);

          if (await ledgerExists(tx)) {
            // Flush any files applied before the ledger existed (this fires once,
            // inside the transaction that applies 0048), then record this file.
            for (const pending of pendingBootstrap) {
              await recordMigration(tx, pending.filename, pending.checksum);
            }
            pendingBootstrap.length = 0;
            await recordMigration(tx, filename, checksum);
          } else {
            pendingBootstrap.push({ checksum, filename });
          }
        });

        if (wasSkipped) {
          skipped.push(filename);
        } else {
          applied.push(filename);
          logger?.info(`Applied migration ${filename}`);
        }
      }

      logger?.info(
        `Migrations complete: ${String(applied.length)} applied, ` +
          `${String(skipped.length)} already recorded.`,
      );

      return { applied, skipped };
    } finally {
      await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY_1}::int, ${MIGRATION_LOCK_KEY_2}::int)`;
    }
  } finally {
    await sql.end();
  }
}
