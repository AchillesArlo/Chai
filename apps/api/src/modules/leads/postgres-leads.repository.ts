import { Inject, Injectable } from '@nestjs/common';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';
import {
  bookAppointment,
  listLeads,
  qualifyLead,
  type LeadSummary,
} from '@chai/domain';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';
import type { AppointmentRecord, LeadRecord } from './leads.repository';
import { LeadsRepository } from './leads.repository';

interface AppointmentRow {
  contact_id: string;
  ends_at: Date;
  id: string;
  resource_id: string;
  starts_at: Date;
  status: string;
  title: string;
}

@Injectable()
export class PostgresLeadsRepository extends LeadsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listLeads(tenantId: string): Promise<LeadRecord[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await listLeads(tx);
        return rows.map((row) => this.mapLead(row, tenantId));
      },
    );
  }

  override async listAppointments(tenantId: string): Promise<AppointmentRecord[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<AppointmentRow[]>`
          SELECT id, contact_id, resource_id, status, starts_at, ends_at, title
          FROM chai.appointment
          WHERE tenant_id = ${tenantId}
          ORDER BY created_at DESC
          LIMIT 100
        `;
        return rows.map((row) => this.mapAppointment(row, tenantId));
      },
    );
  }

  override async qualifyLead(
    tenantId: string,
    leadId: string,
    score: number,
  ): Promise<LeadRecord | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const row = await qualifyLead(tx, leadId, score);
        return row ? this.mapLead(row, tenantId) : null;
      },
    );
  }

  override async bookAppointment(
    tenantId: string,
    input: {
      contactId: string;
      endsAt: string;
      idempotencyKey: string;
      resourceId: string;
      startsAt: string;
      title: string;
    },
  ): Promise<{ appointment: AppointmentRecord; conflict: boolean; created: boolean }> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const result = await bookAppointment(tx, {
          contactId: input.contactId,
          endsAt: new Date(input.endsAt),
          idempotencyKey: input.idempotencyKey,
          resourceId: input.resourceId,
          startsAt: new Date(input.startsAt),
          tenantId,
          title: input.title,
        });
        if (result.overlapConflict) {
          return {
            appointment: {
              contactId: input.contactId,
              endsAt: input.endsAt,
              id: '',
              resourceId: input.resourceId,
              startsAt: input.startsAt,
              status: 'CONFIRMED',
              tenantId,
              title: input.title,
            },
            conflict: true,
            created: false,
          };
        }
        const appointment = await this.loadAppointment(tx, result.appointmentId);
        if (!appointment) {
          throw new Error('appointment missing after book');
        }
        return {
          appointment: this.mapAppointment(appointment, tenantId),
          conflict: false,
          created: result.created,
        };
      },
    );
  }

  private async loadAppointment(
    tx: DatabaseTransaction,
    appointmentId: string,
  ): Promise<AppointmentRow | null> {
    const rows = await tx<AppointmentRow[]>`
      SELECT id, contact_id, resource_id, status, starts_at, ends_at, title
      FROM chai.appointment
      WHERE id = ${appointmentId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private mapLead(row: LeadSummary, tenantId: string): LeadRecord {
    return {
      contactId: row.contactId,
      id: row.id,
      score: row.score,
      stage: row.stage,
      status: row.status,
      tenantId,
    };
  }

  private mapAppointment(row: AppointmentRow, tenantId: string): AppointmentRecord {
    return {
      contactId: row.contact_id,
      endsAt: row.ends_at.toISOString(),
      id: row.id,
      resourceId: row.resource_id,
      startsAt: row.starts_at.toISOString(),
      status: row.status,
      tenantId,
      title: row.title,
    };
  }
}
