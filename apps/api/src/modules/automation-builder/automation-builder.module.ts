import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { AutomationBuilderController } from './automation-builder.controller';
import {
  AutomationBuilderRepository,
  InMemoryAutomationBuilderRepository,
  PostgresAutomationBuilderRepository,
} from './automation-builder.repository';

@Module({
  controllers: [AutomationBuilderController],
  providers: [
    {
      inject: [DATABASE],
      provide: AutomationBuilderRepository,
      useFactory: (database: DatabaseHandle): AutomationBuilderRepository => {
        if (database) return new PostgresAutomationBuilderRepository(database);
        // ponytail: e2e without DATABASE_URL stays in-memory.
        return new InMemoryAutomationBuilderRepository();
      },
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class AutomationBuilderModule {}
