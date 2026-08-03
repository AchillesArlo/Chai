import { Inject, Injectable } from '@nestjs/common';

import { API_CLIENT_OWNER_ID } from '../../database/api-ids';
import {
  PaymentNotificationPort,
  type PaymentNotificationInput,
} from '../shared/action-tool.port';
import { NotificationRepository } from './notification.repository';

/**
 * Adapter exposed via PaymentNotificationPort so PaymentsModule can send
 * in-app payment notifications without directly importing NotificationRepository
 * (eslint boundary rule).
 */
@Injectable()
export class NotificationPaymentAdapter extends PaymentNotificationPort {
  constructor(
    @Inject(NotificationRepository)
    private readonly repository: NotificationRepository,
  ) {
    super();
  }

  override async notify(
    tenantId: string,
    input: PaymentNotificationInput,
  ): Promise<void> {
    // FASE 7: notifikasi in-app saja, channel ke contact di luar scope
    await this.repository.createNotification(tenantId, {
      body: input.message,
      channel: null,
      metadata: {},
      status: 'PENDING',
      title: input.title,
      type: 'IN_APP',
      userId: API_CLIENT_OWNER_ID,
    });
  }
}
