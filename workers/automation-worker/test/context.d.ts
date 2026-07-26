import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    adminDatabaseUrl: string;
    runtimeDatabaseUrl: string;
    workerDatabaseUrl: string;
  }
}
