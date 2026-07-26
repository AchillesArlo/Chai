import { Module } from '@nestjs/common';
import { AdvancedAnalyticsController } from './advanced-analytics.controller';
import { AdvancedAnalyticsRepository, InMemoryAdvancedAnalyticsRepository } from './advanced-analytics.repository';

@Module({
  controllers: [AdvancedAnalyticsController],
  providers: [
    {
      provide: AdvancedAnalyticsRepository,
      useClass: InMemoryAdvancedAnalyticsRepository,
    },
  ],
  exports: [AdvancedAnalyticsRepository],
})
export class AdvancedAnalyticsModule {}
