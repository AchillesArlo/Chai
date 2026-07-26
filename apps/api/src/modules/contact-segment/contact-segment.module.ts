import { Module } from '@nestjs/common';
import { ContactSegmentController } from './contact-segment.controller';
import { ContactSegmentRepository, InMemoryContactSegmentRepository } from './contact-segment.repository';

@Module({
  controllers: [ContactSegmentController],
  providers: [{ provide: ContactSegmentRepository, useClass: InMemoryContactSegmentRepository }],
  exports: [ContactSegmentRepository],
})
export class ContactSegmentModule {}
