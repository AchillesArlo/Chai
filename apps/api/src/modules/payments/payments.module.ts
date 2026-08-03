import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { SecretModule } from '../secret/secret.module';
import { SecretService } from '../secret/secret.service';
import { OrderModule } from '../order/order.module';
import { NotificationModule } from '../notification/notification.module';
import {
  ActionPaymentPort,
  PaymentNotificationPort,
  PaymentOrderPort,
} from '../shared/action-tool.port';
import { PaymentsActionAdapter } from './payments-action.adapter';
import { PaymentsController } from './payments.controller';
import {
  InMemoryPaymentsRepository,
  PaymentsRepository,
} from './payments.repository';
import { PostgresPaymentsRepository } from './postgres-payments.repository';
import {
  PaymentProviderAccountRepository,
  PostgresPaymentProviderAccountRepository,
} from './payment-provider-account.repository';

@Module({
  imports: [SecretModule, OrderModule, NotificationModule],
  controllers: [PaymentsController],
  exports: [PaymentsRepository, PaymentProviderAccountRepository, ActionPaymentPort],
  providers: [
    {
      provide: PaymentsRepository,
      inject: [
        DATABASE,
        PaymentProviderAccountRepository,
        PaymentOrderPort,
        PaymentNotificationPort,
      ],
      useFactory: (
        database: DatabaseHandle,
        providerAccounts: PaymentProviderAccountRepository,
        orders: PaymentOrderPort,
        notifications: PaymentNotificationPort,
      ) =>
        database
          ? new PostgresPaymentsRepository(
              database,
              providerAccounts,
              orders,
              notifications,
            )
          : new InMemoryPaymentsRepository(),
    },
    {
      provide: PaymentProviderAccountRepository,
      inject: [DATABASE, SecretService],
      useFactory: (database: DatabaseHandle, secretService: SecretService) =>
        database
          ? new PostgresPaymentProviderAccountRepository(database, secretService)
          : // ponytail: tanpa DATABASE_URL, account lookup selalu null ->
            // payments repo fallback ke env global. Cukup untuk dev/test.
            (null as unknown as PaymentProviderAccountRepository),
    },
    { provide: ActionPaymentPort, useClass: PaymentsActionAdapter },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class PaymentsModule {}
