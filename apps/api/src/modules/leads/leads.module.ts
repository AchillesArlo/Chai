import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { ActionAppointmentPort } from '../shared/action-tool.port';
import { LeadsActionAdapter } from './leads-action.adapter';
import { LeadsController } from './leads.controller';
import { InMemoryLeadsRepository, LeadsRepository } from './leads.repository';
import { PostgresLeadsRepository } from './postgres-leads.repository';

@Module({
  controllers: [LeadsController],
  exports: [LeadsRepository, ActionAppointmentPort],
  providers: [
    {
      inject: [DATABASE],
      provide: LeadsRepository,
      useFactory: (database: DatabaseHandle): LeadsRepository => {
        if (database) return new PostgresLeadsRepository(database);
        // ponytail: e2e without DATABASE_URL stays in-memory.
        return new InMemoryLeadsRepository();
      },
    },
    { provide: ActionAppointmentPort, useClass: LeadsActionAdapter },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class LeadsModule {}
