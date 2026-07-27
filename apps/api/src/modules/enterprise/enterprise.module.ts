import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseRepository, InMemoryEnterpriseRepository } from './enterprise.repository';
import { PostgresEnterpriseRepository } from './postgres-enterprise.repository';

@Module({
  controllers: [EnterpriseController],
  providers: [
    {
      inject: [DATABASE],
      provide: EnterpriseRepository,
      useFactory: (database: DatabaseHandle): EnterpriseRepository =>
        database
          ? new PostgresEnterpriseRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryEnterpriseRepository(),
    },
  ],
  exports: [EnterpriseRepository],
})
export class EnterpriseModule {}
