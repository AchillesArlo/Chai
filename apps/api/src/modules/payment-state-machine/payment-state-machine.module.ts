import { Module } from '@nestjs/common';
import { PaymentRequestController, PaymentAttemptController, RefundController, DisputeController } from './payment-state-machine.controller';
import { PaymentStateMachineRepository, InMemoryPaymentStateMachineRepository } from './payment-state-machine.repository';

@Module({
  controllers: [PaymentRequestController, PaymentAttemptController, RefundController, DisputeController],
  providers: [
    {
      provide: PaymentStateMachineRepository,
      useClass: InMemoryPaymentStateMachineRepository,
    },
  ],
  exports: [PaymentStateMachineRepository],
})
export class PaymentStateMachineModule {}
