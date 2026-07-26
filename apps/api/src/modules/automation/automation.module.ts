import { Module } from '@nestjs/common';

import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  controllers: [AutomationController],
  providers: [AutomationService],
})
// NestJS discovers module metadata from this decorated class.
export class AutomationModule {}
