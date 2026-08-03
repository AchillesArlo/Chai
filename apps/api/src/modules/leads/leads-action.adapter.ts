import { Inject, Injectable } from '@nestjs/common';

import {
  ActionAppointmentPort,
  type ActionAppointmentInput,
  type ActionAppointmentResult,
} from '../shared/action-tool.port';
import { LeadsRepository } from './leads.repository';

/**
 * Implements the shared ActionAppointmentPort by delegating to this module's
 * own repository — the only place allowed to depend on LeadsRepository
 * directly (02 §5).
 */
@Injectable()
export class LeadsActionAdapter extends ActionAppointmentPort {
  constructor(
    @Inject(LeadsRepository) private readonly repository: LeadsRepository,
  ) {
    super();
  }

  override async create(
    tenantId: string,
    input: ActionAppointmentInput,
  ): Promise<ActionAppointmentResult> {
    const result = await this.repository.bookAppointment(tenantId, input);
    return {
      appointment: {
        endsAt: result.appointment.endsAt,
        id: result.appointment.id,
        startsAt: result.appointment.startsAt,
      },
      conflict: result.conflict,
    };
  }
}
