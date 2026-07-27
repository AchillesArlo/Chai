import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { TemplateController } from './template.controller';
import {
  InMemoryTemplateRepository,
  TemplateRepository,
} from './template.repository';
import { PostgresTemplateRepository } from './postgres-template.repository';

@Module({
  controllers: [TemplateController],
  providers: [
    {
      inject: [DATABASE],
      provide: TemplateRepository,
      useFactory: (database: DatabaseHandle): TemplateRepository =>
        database
          ? new PostgresTemplateRepository(database)
          : // ponytail: e2e without DATABASE_URL stays in-memory.
            new InMemoryTemplateRepository(),
    },
  ],
  exports: [TemplateRepository],
})
// NestJS discovers module metadata from this decorated class.
export class TemplateModule {}
