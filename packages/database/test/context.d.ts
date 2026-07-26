import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    adminDatabaseUrl: string;
    analyticsDatabaseUrl: string;
    apiLoginDatabaseUrl: string;
    migrationOwnerDatabaseUrl: string;
    runtimeDatabaseUrl: string;
    workerDatabaseUrl: string;
    workerLoginDatabaseUrl: string;
  }
}
