import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { TicketController } from './ticket.controller';
import { InMemoryTicketRepository, TicketRepository } from './ticket.repository';
import { PostgresTicketRepository } from './postgres-ticket.repository';

@Module({
  controllers: [TicketController],
  providers: [
    {
      inject: [DATABASE],
      provide: TicketRepository,
      useFactory: (database: DatabaseHandle): TicketRepository =>
        database
          ? new PostgresTicketRepository(database)
          : // ponytail: e2e without DATABASE_URL stays in-memory.
            new InMemoryTicketRepository(),
    },
  ],
  exports: [TicketRepository],
})
// NestJS discovers module metadata from this decorated class.
export class TicketModule {}
