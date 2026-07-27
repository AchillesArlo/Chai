import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { AIAgentController } from './ai-agent.controller';
import { AIAgentRepository, InMemoryAIAgentRepository } from './ai-agent.repository';
import { PostgresAIAgentRepository } from './postgres-ai-agent.repository';

@Module({
  controllers: [AIAgentController],
  providers: [
    {
      inject: [DATABASE],
      provide: AIAgentRepository,
      useFactory: (database: DatabaseHandle): AIAgentRepository =>
        database
          ? new PostgresAIAgentRepository(database)
          : // ponytail: e2e without DATABASE_URL stays in-memory.
            new InMemoryAIAgentRepository(),
    },
  ],
  exports: [AIAgentRepository],
})
// NestJS discovers module metadata from this decorated class.
export class AIAgentModule {}
