import { Module } from '@nestjs/common';
import { MultiRegionController } from './multi-region.controller';
import { MultiRegionRepository, InMemoryMultiRegionRepository } from './multi-region.repository';

@Module({
  controllers: [MultiRegionController],
  providers: [
    {
      provide: MultiRegionRepository,
      useClass: InMemoryMultiRegionRepository,
    },
  ],
  exports: [MultiRegionRepository],
})
export class MultiRegionModule {}
