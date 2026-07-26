import { Module } from '@nestjs/common';
import { CommandEventController } from './command-event.controller';
import { InMemoryCommandEventRepository } from './command-event.repository';

@Module({
  controllers: [CommandEventController],
  providers: [
    {
      provide: 'CommandEventRepository',
      useClass: InMemoryCommandEventRepository,
    },
  ],
  exports: ['CommandEventRepository'],
})
export class CommandEventModule {}
