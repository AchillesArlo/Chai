import { Module } from '@nestjs/common';

import {
  DATABASE,
  type DatabaseHandle,
} from '../../database/database.module';
import { AuditController } from './audit.controller';
import { AuditLogRepository } from './audit-log.repository';

@Module({
  controllers: [AuditController],
  providers: [
    {
      inject: [DATABASE],
      provide: AuditLogRepository,
      useFactory: (database: DatabaseHandle): AuditLogRepository => {
        return new AuditLogRepository(database);
      },
    },
  ],
  exports: [AuditLogRepository],
})
// NestJS discovers module metadata from this decorated class.
export class AuditModule {}
