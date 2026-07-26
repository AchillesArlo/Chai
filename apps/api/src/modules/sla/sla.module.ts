import { Module } from '@nestjs/common';
import { SLAController } from './sla.controller';
import { SLARepository, InMemorySLARepository } from './sla.repository';

@Module({
  controllers: [SLAController],
  providers: [{ provide: SLARepository, useClass: InMemorySLARepository }],
  exports: [SLARepository],
})
export class SLAModule {}
