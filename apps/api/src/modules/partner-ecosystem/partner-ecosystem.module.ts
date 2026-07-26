import { Module } from '@nestjs/common';
import { PartnerEcosystemController } from './partner-ecosystem.controller';
import { PartnerEcosystemRepository, InMemoryPartnerEcosystemRepository } from './partner-ecosystem.repository';

@Module({
  controllers: [PartnerEcosystemController],
  providers: [
    {
      provide: PartnerEcosystemRepository,
      useClass: InMemoryPartnerEcosystemRepository,
    },
  ],
  exports: [PartnerEcosystemRepository],
})
export class PartnerEcosystemModule {}
