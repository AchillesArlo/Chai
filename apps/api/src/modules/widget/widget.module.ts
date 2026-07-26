import { Module } from '@nestjs/common';
import { WidgetController } from './widget.controller';
import { InMemoryWidgetRepository } from './widget.repository';

@Module({
  controllers: [WidgetController],
  providers: [
    {
      provide: 'WidgetRepository',
      useClass: InMemoryWidgetRepository,
    },
  ],
  exports: ['WidgetRepository'],
})
export class WidgetModule {}
