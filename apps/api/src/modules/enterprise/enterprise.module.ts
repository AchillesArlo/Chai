import { Module } from '@nestjs/common';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseRepository, InMemoryEnterpriseRepository } from './enterprise.repository';

@Module({
  controllers: [EnterpriseController],
  providers: [
    {
      provide: EnterpriseRepository,
      useClass: InMemoryEnterpriseRepository,
    },
  ],
  exports: [EnterpriseRepository],
})
export class EnterpriseModule {}
