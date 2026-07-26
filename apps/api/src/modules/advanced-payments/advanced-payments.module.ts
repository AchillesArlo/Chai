import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { AdvancedPaymentsController } from './advanced-payments.controller';
import {
  AdvancedPaymentsRepository,
  InMemoryAdvancedPaymentsRepository,
} from './advanced-payments.repository';
import { PostgresAdvancedPaymentsRepository } from './postgres-advanced-payments.repository';

@Module({
  controllers: [AdvancedPaymentsController],
  exports: [AdvancedPaymentsRepository],
  providers: [
    {
      provide: AdvancedPaymentsRepository,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle) =>
        database
          ? new PostgresAdvancedPaymentsRepository(database)
          : new InMemoryAdvancedPaymentsRepository(),
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class AdvancedPaymentsModule {}
