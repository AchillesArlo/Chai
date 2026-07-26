import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    adminDatabaseUrl: string;
    workerDatabaseUrl: string;
  }
}
