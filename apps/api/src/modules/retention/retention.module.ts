import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { RetentionController } from './retention.controller';
import { InMemoryRetentionRepository, type RetentionRepository } from './retention.repository';
import { PostgresRetentionRepository } from './postgres-retention.repository';

@Module({
  controllers: [RetentionController],
  providers: [
    {
      inject: [DATABASE],
      provide: 'RetentionRepository',
      useFactory: (database: DatabaseHandle): RetentionRepository =>
        database
          ? new PostgresRetentionRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryRetentionRepository(),
    },
  ],
  exports: ['RetentionRepository'],
})
export class RetentionModule {}
