import { Module } from '@nestjs/common';
import { QuarantineController } from './quarantine.controller';
import { InMemoryQuarantineRepository } from './quarantine.repository';

@Module({
  controllers: [QuarantineController],
  providers: [
    {
      provide: 'QuarantineRepository',
      useClass: InMemoryQuarantineRepository,
    },
  ],
  exports: ['QuarantineRepository'],
})
export class QuarantineModule {}
