import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { IamController } from './iam.controller';
import { IamRepository } from './iam.repository';
import { InMemoryIamRepository } from './in-memory-iam.repository';
import { PostgresIamRepository } from './postgres-iam.repository';

@Module({
  controllers: [IamController],
  providers: [
    {
      inject: [DATABASE],
      provide: IamRepository,
      useFactory: (database: DatabaseHandle): IamRepository => {
        if (database) return new PostgresIamRepository(database);
        // ponytail: e2e without DATABASE_URL stays in-memory.
        return new InMemoryIamRepository();
      },
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class IamModule {}
