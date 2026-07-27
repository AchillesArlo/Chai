import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { AuditImmutabilityController } from './audit-immutability.controller';
import {
  AuditImmutabilityRepository,
  InMemoryAuditImmutabilityRepository,
} from './audit-immutability.repository';
import { PostgresAuditImmutabilityRepository } from './postgres-audit-immutability.repository';

@Module({
  controllers: [AuditImmutabilityController],
  providers: [
    {
      inject: [DATABASE],
      provide: AuditImmutabilityRepository,
      useFactory: (database: DatabaseHandle): AuditImmutabilityRepository =>
        database
          ? new PostgresAuditImmutabilityRepository(database)
          : // ponytail: e2e without DATABASE_URL stays in-memory.
            new InMemoryAuditImmutabilityRepository(),
    },
  ],
  exports: [AuditImmutabilityRepository],
})
// NestJS discovers module metadata from this decorated class.
export class AuditImmutabilityModule {}
