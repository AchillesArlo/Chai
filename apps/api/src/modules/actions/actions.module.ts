import { Module } from '@nestjs/common';

import { ActionsController } from './actions.controller';

@Module({
  controllers: [ActionsController],
})
// NestJS discovers module metadata from this decorated class.
export class ActionsModule {}
