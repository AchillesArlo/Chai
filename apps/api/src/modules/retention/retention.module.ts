import { Module } from '@nestjs/common';
import { RetentionController } from './retention.controller';
import { InMemoryRetentionRepository } from './retention.repository';

@Module({
  controllers: [RetentionController],
  providers: [
    {
      provide: 'RetentionRepository',
      useClass: InMemoryRetentionRepository,
    },
  ],
  exports: ['RetentionRepository'],
})
export class RetentionModule {}
