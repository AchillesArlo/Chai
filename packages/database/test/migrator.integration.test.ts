import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { runMigrations } from '../src';

const migrationsDirectory = join(process.cwd(), 'migrations');

let migrationFiles: string[] = [];

beforeAll(async () => {
  migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
});

describe('production migration runner', () => {
  it('recorded every migration global setup applied to the shared database', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const rows = await admin<{ filename: string }[]>`
        SELECT filename FROM chai.schema_migration ORDER BY filename
      `;

      expect(rows.map((row) => row.filename)).toEqual(migrationFiles);
      expect(migrationFiles.length).toBeGreaterThanOrEqual(48);
    } finally {
      await admin.end();
    }
  });

  it('is a no-op when re-run against an already-migrated database', async () => {
    const result = await runMigrations({
      databaseUrl: inject('adminDatabaseUrl'),
      migrationsDirectory,
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(migrationFiles);
  });

  describe('against an isolated database', () => {
    const probeDatabase = 'chai_migrator_probe';
    let probeUrl = '';

    beforeAll(async () => {
      const url = new URL(inject('adminDatabaseUrl'));
      url.pathname = `/${probeDatabase}`;
      probeUrl = url.toString();

      const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });
      try {
        // DROP/CREATE DATABASE cannot run inside a transaction; issue them as
        // plain autocommit statements against the container's default database.
        await admin.unsafe(
          `DROP DATABASE IF EXISTS ${probeDatabase} WITH (FORCE)`,
        );
        await admin.unsafe(`CREATE DATABASE ${probeDatabase}`);
      } finally {
        await admin.end();
      }
    });

    afterAll(async () => {
      const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });
      try {
        await admin.unsafe(
          `DROP DATABASE IF EXISTS ${probeDatabase} WITH (FORCE)`,
        );
      } finally {
        await admin.end();
      }
    });

    it('applies every migration from zero, records the ledger, then is idempotent', async () => {
      const first = await runMigrations({
        databaseUrl: probeUrl,
        migrationsDirectory,
      });

      expect(first.applied).toEqual(migrationFiles);
      expect(first.skipped).toEqual([]);

      const admin = postgres(probeUrl, { max: 1 });
      try {
        const rows = await admin<
          { applied_by: string; checksum: string; filename: string }[]
        >`
          SELECT filename, checksum, applied_by
          FROM chai.schema_migration
          ORDER BY filename
        `;

        expect(rows.map((row) => row.filename)).toEqual(migrationFiles);
        for (const row of rows) {
          expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
          expect(row.applied_by.length).toBeGreaterThan(0);
        }
      } finally {
        await admin.end();
      }

      const second = await runMigrations({
        databaseUrl: probeUrl,
        migrationsDirectory,
      });

      expect(second.applied).toEqual([]);
      expect(second.skipped).toEqual(migrationFiles);
    });

    it('rejects a migration whose checksum changed after being applied', async () => {
      const target = migrationFiles[0] ?? '0001_foundation.sql';
      const tamperedDirectory = await mkdtemp(join(tmpdir(), 'chai-migrator-'));

      try {
        // A single file, named like an already-applied migration but with
        // different content: the runner must reject it on checksum mismatch.
        await writeFile(
          join(tamperedDirectory, target),
          '-- tampered: this content must not match the applied migration\n',
          'utf8',
        );

        let caught: unknown;
        try {
          await runMigrations({
            databaseUrl: probeUrl,
            migrationsDirectory: tamperedDirectory,
          });
        } catch (error) {
          caught = error;
        }

        expect(
          caught,
          'runMigrations must reject a changed checksum',
        ).toBeInstanceOf(Error);
        const message = caught instanceof Error ? caught.message : String(caught);
        expect(message).toContain(target);
        expect(message).toMatch(/immutable/i);

        // The rejection must not have touched the ledger it guards.
        const admin = postgres(probeUrl, { max: 1 });
        try {
          const [row] = await admin<{ count: number }[]>`
            SELECT count(*)::int AS count FROM chai.schema_migration
          `;
          expect(row?.count).toBe(migrationFiles.length);
        } finally {
          await admin.end();
        }
      } finally {
        await rm(tamperedDirectory, { force: true, recursive: true });
      }
    });
  });
});
