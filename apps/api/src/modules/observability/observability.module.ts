import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { ObservabilityController } from './observability.controller';
import { ObservabilityRepository, InMemoryObservabilityRepository } from './observability.repository';
import { PostgresObservabilityRepository } from './postgres-observability.repository';

@Module({
  controllers: [ObservabilityController],
  providers: [
    {
      inject: [DATABASE],
      provide: ObservabilityRepository,
      useFactory: (database: DatabaseHandle): ObservabilityRepository =>
        database
          ? new PostgresObservabilityRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryObservabilityRepository(),
    },
  ],
  exports: [ObservabilityRepository],
})
export class ObservabilityModule {}
