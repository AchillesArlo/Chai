import { Inject, Injectable } from '@nestjs/common';

import { ActionShipmentPort, type ActionShipmentStatus } from '../shared/action-tool.port';
import { LogisticsRepository } from './logistics.repository';

/**
 * Implements the shared ActionShipmentPort by delegating to this module's
 * own repository — the only place allowed to depend on LogisticsRepository
 * directly (02 §5).
 */
@Injectable()
export class LogisticsActionAdapter extends ActionShipmentPort {
  constructor(
    @Inject(LogisticsRepository) private readonly repository: LogisticsRepository,
  ) {
    super();
  }

  override async getStatus(
    tenantId: string,
    trackingNumber: string,
    proof: { contactId?: string; orderReference?: string },
  ): Promise<ActionShipmentStatus | null> {
    const view = await this.repository.customerLookup(tenantId, trackingNumber, proof);
    if (!view) return null;
    return {
      carrier: view.carrier,
      status: view.status,
      timeline: view.timeline,
      trackingNumber: view.trackingNumber,
    };
  }
}
