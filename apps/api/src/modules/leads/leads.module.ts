import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { LeadsController } from './leads.controller';
import { InMemoryLeadsRepository, LeadsRepository } from './leads.repository';
import { PostgresLeadsRepository } from './postgres-leads.repository';

@Module({
  controllers: [LeadsController],
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
  ],
})
// NestJS discovers module metadata from this decorated class.
export class LeadsModule {}
