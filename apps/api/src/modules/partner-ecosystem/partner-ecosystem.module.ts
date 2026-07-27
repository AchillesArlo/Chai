import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { PartnerEcosystemController } from './partner-ecosystem.controller';
import { PartnerEcosystemRepository, InMemoryPartnerEcosystemRepository } from './partner-ecosystem.repository';
import { PostgresPartnerEcosystemRepository } from './postgres-partner-ecosystem.repository';

@Module({
  controllers: [PartnerEcosystemController],
  providers: [
    {
      inject: [DATABASE],
      provide: PartnerEcosystemRepository,
      useFactory: (database: DatabaseHandle): PartnerEcosystemRepository =>
        database
          ? new PostgresPartnerEcosystemRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryPartnerEcosystemRepository(),
    },
  ],
  exports: [PartnerEcosystemRepository],
})
export class PartnerEcosystemModule {}
