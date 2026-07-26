import { Global, Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import {
  EntitlementService,
  EnvEntitlementService,
  PostgresEntitlementService,
} from './entitlement.service';

/**
 * Global so any module can gate a route on a capability without re-wiring
 * providers: entitlement is a cross-cutting decision, like tenancy.
 */
@Global()
@Module({
  exports: [EntitlementService],
  providers: [
    {
      provide: EntitlementService,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle): EntitlementService =>
        database
          ? new PostgresEntitlementService(database)
          : new EnvEntitlementService(),
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class EntitlementModule {}

export { EntitlementService, EnvEntitlementService, PostgresEntitlementService };
