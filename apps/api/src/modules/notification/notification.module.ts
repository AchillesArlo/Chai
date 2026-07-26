import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationRepository, InMemoryNotificationRepository } from './notification.repository';

@Module({
  controllers: [NotificationController],
  providers: [{ provide: NotificationRepository, useClass: InMemoryNotificationRepository }],
  exports: [NotificationRepository],
})
export class NotificationModule {}
