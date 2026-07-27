import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { WidgetController } from './widget.controller';
import { InMemoryWidgetRepository, type WidgetRepository } from './widget.repository';
import { PostgresWidgetRepository } from './postgres-widget.repository';

@Module({
  controllers: [WidgetController],
  providers: [
    {
      inject: [DATABASE],
      provide: 'WidgetRepository',
      useFactory: (database: DatabaseHandle): WidgetRepository =>
        database
          ? new PostgresWidgetRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryWidgetRepository(),
    },
  ],
  exports: ['WidgetRepository'],
})
export class WidgetModule {}
