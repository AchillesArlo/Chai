import { Module } from '@nestjs/common';
import { OutboxController } from './outbox.controller';
import { InMemoryOutboxRepository } from './outbox.repository';

@Module({
  controllers: [OutboxController],
  providers: [
    {
      provide: 'OutboxRepository',
      useClass: InMemoryOutboxRepository,
    },
  ],
  exports: ['OutboxRepository'],
})
export class OutboxModule {}
