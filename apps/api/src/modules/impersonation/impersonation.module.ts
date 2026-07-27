import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { ImpersonationController } from './impersonation.controller';
import { InMemoryImpersonationRepository, type ImpersonationRepository } from './impersonation.repository';
import { PostgresImpersonationRepository } from './postgres-impersonation.repository';

@Module({
  controllers: [ImpersonationController],
  providers: [
    {
      inject: [DATABASE],
      provide: 'ImpersonationRepository',
      useFactory: (database: DatabaseHandle): ImpersonationRepository =>
        database
          ? new PostgresImpersonationRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryImpersonationRepository(),
    },
  ],
  exports: ['ImpersonationRepository'],
})
export class ImpersonationModule {}
