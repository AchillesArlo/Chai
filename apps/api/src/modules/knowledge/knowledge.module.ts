import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { ActionKnowledgePort } from '../shared/action-tool.port';
import { KnowledgeActionAdapter } from './knowledge-action.adapter';
import { KnowledgeController } from './knowledge.controller';
import {
  InMemoryKnowledgeRepository,
  KnowledgeRepository,
} from './knowledge.repository';
import { PostgresKnowledgeRepository } from './postgres-knowledge.repository';

@Module({
  controllers: [KnowledgeController],
  exports: [KnowledgeRepository, ActionKnowledgePort],
  providers: [
    {
      provide: KnowledgeRepository,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle) =>
        database
          ? new PostgresKnowledgeRepository(database)
          : new InMemoryKnowledgeRepository(),
    },
    { provide: ActionKnowledgePort, useClass: KnowledgeActionAdapter },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class KnowledgeModule {}
