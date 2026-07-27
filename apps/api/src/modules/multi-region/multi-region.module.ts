import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { MultiRegionController } from './multi-region.controller';
import { MultiRegionRepository, InMemoryMultiRegionRepository } from './multi-region.repository';
import { PostgresMultiRegionRepository } from './postgres-multi-region.repository';

@Module({
  controllers: [MultiRegionController],
  providers: [
    {
      inject: [DATABASE],
      provide: MultiRegionRepository,
      useFactory: (database: DatabaseHandle): MultiRegionRepository =>
        database
          ? new PostgresMultiRegionRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryMultiRegionRepository(),
    },
  ],
  exports: [MultiRegionRepository],
})
export class MultiRegionModule {}
