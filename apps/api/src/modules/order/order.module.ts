import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { PaymentOrderPort } from '../shared/action-tool.port';
import { OrderController } from './order.controller';
import { OrderPaymentAdapter } from './order-payment.adapter';
import {
  InMemoryOrderRepository,
  type OrderRepository,
} from './order.repository';
import { PostgresOrderRepository } from './postgres-order.repository';

@Module({
  controllers: [OrderController],
  providers: [
    {
      inject: [DATABASE],
      provide: 'OrderRepository',
      useFactory: (database: DatabaseHandle): OrderRepository =>
        database
          ? new PostgresOrderRepository(database)
          : new InMemoryOrderRepository(),
    },
    { provide: PaymentOrderPort, useClass: OrderPaymentAdapter },
  ],
  exports: ['OrderRepository', PaymentOrderPort],
})
export class OrderModule {}
