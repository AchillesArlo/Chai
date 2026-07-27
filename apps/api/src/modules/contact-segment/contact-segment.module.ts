import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { ContactSegmentController } from './contact-segment.controller';
import {
  ContactSegmentRepository,
  InMemoryContactSegmentRepository,
} from './contact-segment.repository';
import { PostgresContactSegmentRepository } from './postgres-contact-segment.repository';

@Module({
  controllers: [ContactSegmentController],
  providers: [
    {
      provide: ContactSegmentRepository,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle) =>
        database
          ? new PostgresContactSegmentRepository(database)
          : new InMemoryContactSegmentRepository(),
    },
  ],
  exports: [ContactSegmentRepository],
})
// NestJS discovers module metadata from this decorated class.
export class ContactSegmentModule {}
