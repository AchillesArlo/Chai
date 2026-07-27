import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { AttachmentController } from './attachment.controller';
import { AttachmentRepository, InMemoryAttachmentRepository } from './attachment.repository';
import { PostgresAttachmentRepository } from './postgres-attachment.repository';

@Module({
  controllers: [AttachmentController],
  providers: [
    {
      inject: [DATABASE],
      provide: AttachmentRepository,
      useFactory: (database: DatabaseHandle): AttachmentRepository =>
        database
          ? new PostgresAttachmentRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryAttachmentRepository(),
    },
  ],
  exports: [AttachmentRepository],
})
export class AttachmentModule {}
