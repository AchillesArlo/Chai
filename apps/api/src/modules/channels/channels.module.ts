import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { ChannelsController } from './channels.controller';
import { ConversationRepository } from '../shared/conversation.port';
import { InMemoryConversationRepository } from './in-memory-conversation.repository';
import { PostgresConversationRepository } from './postgres-conversation.repository';
import { RealtimePublisher } from './realtime-publisher';

@Module({
  controllers: [ChannelsController],
  exports: [ConversationRepository],
  providers: [
    RealtimePublisher,
    {
      inject: [DATABASE],
      provide: ConversationRepository,
      useFactory: (database: DatabaseHandle): ConversationRepository => {
        if (database) {
          return new PostgresConversationRepository(database);
        }
        // ponytail: e2e / local without DATABASE_URL stays in-memory.
        return new InMemoryConversationRepository();
      },
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class ChannelsModule {}
