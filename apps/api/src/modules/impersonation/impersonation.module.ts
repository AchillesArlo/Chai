import { Module } from '@nestjs/common';
import { ImpersonationController } from './impersonation.controller';
import { InMemoryImpersonationRepository } from './impersonation.repository';

@Module({
  controllers: [ImpersonationController],
  providers: [
    {
      provide: 'ImpersonationRepository',
      useClass: InMemoryImpersonationRepository,
    },
  ],
  exports: ['ImpersonationRepository'],
})
export class ImpersonationModule {}
