import { Global, Module } from '@nestjs/common';

import { createDatabase, type Database } from '@chai/database';

import { API_SERVICE_PRINCIPAL_ID } from './api-ids';

/**
 * Stage 2 S2-1: optional Postgres handle for the API process.
 * Absent DATABASE_URL → null (in-memory repositories stay in place for e2e).
 * Production without DATABASE_URL throws so in-memory never ships silently.
 */
export const DATABASE = Symbol('DATABASE');

export type DatabaseHandle = Database | null;

/** Synthetic service principal for webhook/worker writes under RLS. */
export const SERVICE_PRINCIPAL_ID = API_SERVICE_PRINCIPAL_ID;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): DatabaseHandle => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('DATABASE_URL is required in production');
          }
          return null;
        }
        return createDatabase(url);
      },
    },
  ],
  exports: [DATABASE],
})
// NestJS discovers module metadata from this decorated class.
export class DatabaseModule {}
