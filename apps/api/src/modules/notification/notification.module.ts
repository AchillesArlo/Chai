import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { PaymentNotificationPort } from '../shared/action-tool.port';
import { NotificationController } from './notification.controller';
import { NotificationPaymentAdapter } from './notification-payment.adapter';
import {
  InMemoryNotificationRepository,
  NotificationRepository,
} from './notification.repository';
import { PostgresNotificationRepository } from './postgres-notification.repository';

@Module({
  controllers: [NotificationController],
  providers: [
    {
      inject: [DATABASE],
      provide: NotificationRepository,
      useFactory: (database: DatabaseHandle): NotificationRepository =>
        database
          ? new PostgresNotificationRepository(database)
          : // ponytail: e2e without DATABASE_URL stays in-memory.
            new InMemoryNotificationRepository(),
    },
    {
      provide: PaymentNotificationPort,
      useClass: NotificationPaymentAdapter,
    },
  ],
  exports: [NotificationRepository, PaymentNotificationPort],
})
// NestJS discovers module metadata from this decorated class.
export class NotificationModule {}
