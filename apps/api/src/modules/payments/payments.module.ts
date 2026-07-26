import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { PaymentsController } from './payments.controller';
import {
  InMemoryPaymentsRepository,
  PaymentsRepository,
} from './payments.repository';
import { PostgresPaymentsRepository } from './postgres-payments.repository';

@Module({
  controllers: [PaymentsController],
  exports: [PaymentsRepository],
  providers: [
    {
      provide: PaymentsRepository,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle) =>
        database
          ? new PostgresPaymentsRepository(database)
          : new InMemoryPaymentsRepository(),
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class PaymentsModule {}
