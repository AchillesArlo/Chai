import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { AdvancedLogisticsController } from './advanced-logistics.controller';
import {
  AdvancedLogisticsRepository,
  InMemoryAdvancedLogisticsRepository,
  PostgresAdvancedLogisticsRepository,
} from './advanced-logistics.repository';

@Module({
  controllers: [AdvancedLogisticsController],
  exports: [AdvancedLogisticsRepository],
  providers: [
    {
      provide: AdvancedLogisticsRepository,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle) =>
        database
          ? new PostgresAdvancedLogisticsRepository(database)
          : new InMemoryAdvancedLogisticsRepository(),
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class AdvancedLogisticsModule {}
