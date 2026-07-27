import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { QuarantineController } from './quarantine.controller';
import { InMemoryQuarantineRepository, type QuarantineRepository } from './quarantine.repository';
import { PostgresQuarantineRepository } from './postgres-quarantine.repository';

@Module({
  controllers: [QuarantineController],
  providers: [
    {
      inject: [DATABASE],
      provide: 'QuarantineRepository',
      useFactory: (database: DatabaseHandle): QuarantineRepository =>
        database
          ? new PostgresQuarantineRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryQuarantineRepository(),
    },
  ],
  exports: ['QuarantineRepository'],
})
export class QuarantineModule {}
