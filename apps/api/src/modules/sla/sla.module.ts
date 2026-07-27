import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { SLAController } from './sla.controller';
import { InMemorySLARepository, SLARepository } from './sla.repository';
import { PostgresSLARepository } from './postgres-sla.repository';

@Module({
  controllers: [SLAController],
  providers: [
    {
      inject: [DATABASE],
      provide: SLARepository,
      useFactory: (database: DatabaseHandle): SLARepository =>
        database
          ? new PostgresSLARepository(database)
          : // ponytail: e2e without DATABASE_URL stays in-memory.
            new InMemorySLARepository(),
    },
  ],
  exports: [SLARepository],
})
// NestJS discovers module metadata from this decorated class.
export class SLAModule {}
