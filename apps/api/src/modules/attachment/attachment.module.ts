import { Module } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { AttachmentRepository, InMemoryAttachmentRepository } from './attachment.repository';

@Module({
  controllers: [AttachmentController],
  providers: [{ provide: AttachmentRepository, useClass: InMemoryAttachmentRepository }],
  exports: [AttachmentRepository],
})
export class AttachmentModule {}
