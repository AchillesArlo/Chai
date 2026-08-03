import { Inject, Injectable } from '@nestjs/common';

import { ActionPaymentPort, type ActionPaymentStatus } from '../shared/action-tool.port';
import { PaymentsRepository } from './payments.repository';

/**
 * Implements the shared ActionPaymentPort by delegating to this module's own
 * repository — the only place allowed to depend on PaymentsRepository
 * directly (02 §5).
 */
@Injectable()
export class PaymentsActionAdapter extends ActionPaymentPort {
  constructor(
    @Inject(PaymentsRepository) private readonly repository: PaymentsRepository,
  ) {
    super();
  }

  override async getStatus(
    tenantId: string,
    externalId: string,
  ): Promise<ActionPaymentStatus | null> {
    const session = await this.repository.getSession(tenantId, externalId);
    if (!session) return null;
    return {
      amount: session.amount,
      currency: session.currency,
      externalId: session.externalId,
      status: session.status,
    };
  }
}
