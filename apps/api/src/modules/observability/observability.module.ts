import { Module } from '@nestjs/common';
import { ObservabilityController } from './observability.controller';
import { ObservabilityRepository, InMemoryObservabilityRepository } from './observability.repository';

@Module({
  controllers: [ObservabilityController],
  providers: [
    {
      provide: ObservabilityRepository,
      useClass: InMemoryObservabilityRepository,
    },
  ],
  exports: [ObservabilityRepository],
})
export class ObservabilityModule {}
