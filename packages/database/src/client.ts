import postgres from 'postgres';

export type Database = postgres.Sql;
export type DatabaseTransaction = postgres.TransactionSql;

export function createDatabase(databaseUrl: string): Database {
  return postgres(databaseUrl, {
    idle_timeout: 20,
    max: 10,
    prepare: true,
  });
}
