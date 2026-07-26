import { Module } from '@nestjs/common';
import { AuditImmutabilityController } from './audit-immutability.controller';
import { AuditImmutabilityRepository, InMemoryAuditImmutabilityRepository } from './audit-immutability.repository';

@Module({
  controllers: [AuditImmutabilityController],
  providers: [
    {
      provide: AuditImmutabilityRepository,
      useClass: InMemoryAuditImmutabilityRepository,
    },
  ],
  exports: [AuditImmutabilityRepository],
})
export class AuditImmutabilityModule {}
