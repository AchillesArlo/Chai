import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { AnalyticsController } from './analytics.controller';
import {
  AnalyticsRepository,
  InMemoryAnalyticsRepository,
} from './analytics.repository';
import { PostgresAnalyticsRepository } from './postgres-analytics.repository';

@Module({
  controllers: [AnalyticsController],
  exports: [AnalyticsRepository],
  providers: [
    {
      inject: [DATABASE],
      provide: AnalyticsRepository,
      useFactory: (database: DatabaseHandle): AnalyticsRepository => {
        if (database) return new PostgresAnalyticsRepository(database);
        // ponytail: e2e without DATABASE_URL stays in-memory.
        return new InMemoryAnalyticsRepository();
      },
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class AnalyticsModule {}
