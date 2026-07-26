import { Module } from '@nestjs/common';

import { DlqController } from './dlq.controller';
import { DlqRepository } from './dlq.repository';

@Module({
  controllers: [DlqController],
  providers: [DlqRepository],
  exports: [DlqRepository],
})
// NestJS discovers module metadata from this decorated class.
export class DlqModule {}
