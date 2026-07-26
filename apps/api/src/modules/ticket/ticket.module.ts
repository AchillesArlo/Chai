import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketRepository, InMemoryTicketRepository } from './ticket.repository';

@Module({
  controllers: [TicketController],
  providers: [{ provide: TicketRepository, useClass: InMemoryTicketRepository }],
  exports: [TicketRepository],
})
export class TicketModule {}
