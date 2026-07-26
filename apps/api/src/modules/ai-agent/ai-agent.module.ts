import { Module } from '@nestjs/common';
import { AIAgentController } from './ai-agent.controller';
import { AIAgentRepository, InMemoryAIAgentRepository } from './ai-agent.repository';

@Module({
  controllers: [AIAgentController],
  providers: [
    {
      provide: AIAgentRepository,
      useClass: InMemoryAIAgentRepository,
    },
  ],
  exports: [AIAgentRepository],
})
export class AIAgentModule {}
