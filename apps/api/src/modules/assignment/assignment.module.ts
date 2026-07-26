import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { AssignmentController } from './assignment.controller';

@Module({
  controllers: [AssignmentController],
  imports: [ChannelsModule],
})
// NestJS discovers module metadata from this decorated class.
export class AssignmentModule {}
