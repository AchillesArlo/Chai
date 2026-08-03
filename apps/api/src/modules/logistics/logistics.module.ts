import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { ActionShipmentPort } from '../shared/action-tool.port';
import { LogisticsActionAdapter } from './logistics-action.adapter';
import { LogisticsController } from './logistics.controller';
import {
  InMemoryLogisticsRepository,
  LogisticsRepository,
} from './logistics.repository';
import { PostgresLogisticsRepository } from './postgres-logistics.repository';

@Module({
  controllers: [LogisticsController],
  exports: [LogisticsRepository, ActionShipmentPort],
  providers: [
    // ponytail: immutable tracking table + polling worker later.
    {
      provide: LogisticsRepository,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle) =>
        database
          ? new PostgresLogisticsRepository(database)
          : new InMemoryLogisticsRepository(),
    },
    { provide: ActionShipmentPort, useClass: LogisticsActionAdapter },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class LogisticsModule {}
