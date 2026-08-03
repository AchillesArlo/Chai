import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { AuditPort } from '../shared/audit.port';
import { AuditImmutabilityController } from './audit-immutability.controller';
import {
  AuditImmutabilityRepository,
  InMemoryAuditImmutabilityRepository,
} from './audit-immutability.repository';
import {
  PostgresAuditImmutabilityRepository,
} from './postgres-audit-immutability.repository';
import { AuditImmutabilityPortAdapter } from './audit-immutability.port-adapter';

@Module({
  controllers: [AuditImmutabilityController],
  providers: [
    {
      inject: [DATABASE],
      provide: AuditImmutabilityRepository,
      useFactory: (database: DatabaseHandle): AuditImmutabilityRepository =>
        database
          ? new PostgresAuditImmutabilityRepository(database)
          : new InMemoryAuditImmutabilityRepository(),
    },
    {
      inject: [AuditImmutabilityRepository],
      provide: AuditPort,
      useFactory: (repo: AuditImmutabilityRepository): AuditPort =>
        new AuditImmutabilityPortAdapter(repo),
    },
  ],
  exports: [AuditPort, AuditImmutabilityRepository],
})
// NestJS discovers module metadata from this decorated class.
export class AuditImmutabilityModule {}
