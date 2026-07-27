import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { AdvancedAnalyticsController } from './advanced-analytics.controller';
import { AdvancedAnalyticsRepository, InMemoryAdvancedAnalyticsRepository } from './advanced-analytics.repository';
import { PostgresAdvancedAnalyticsRepository } from './postgres-advanced-analytics.repository';

@Module({
  controllers: [AdvancedAnalyticsController],
  providers: [
    {
      inject: [DATABASE],
      provide: AdvancedAnalyticsRepository,
      useFactory: (database: DatabaseHandle): AdvancedAnalyticsRepository =>
        database
          ? new PostgresAdvancedAnalyticsRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryAdvancedAnalyticsRepository(),
    },
  ],
  exports: [AdvancedAnalyticsRepository],
})
export class AdvancedAnalyticsModule {}
