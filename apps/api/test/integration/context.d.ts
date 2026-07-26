declare module 'vitest' {
  export interface ProvidedContext {
    adminDatabaseUrl: string;
    runtimeDatabaseUrl: string;
  }
}

export {};
