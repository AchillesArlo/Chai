import { randomUUID } from 'node:crypto';

export interface LeadRecord {
  contactId: string;
  id: string;
  score: number;
  stage: string;
  status: string;
  tenantId: string;
}

export interface AppointmentRecord {
  contactId: string;
  endsAt: string;
  id: string;
  resourceId: string;
  startsAt: string;
  status: string;
  tenantId: string;
  title: string;
}

/**
 * Persistence port for the leads/appointments vertical. In-memory default
 * backs the API e2e suite; a database-backed implementation wraps
 * @chai/domain leads once the API gains a runtime database connection.
 */
export abstract class LeadsRepository {
  abstract listLeads(tenantId: string): Promise<LeadRecord[]>;
  abstract listAppointments(tenantId: string): Promise<AppointmentRecord[]>;
  abstract qualifyLead(tenantId: string, leadId: string, score: number): Promise<LeadRecord | null>;
  abstract bookAppointment(
    tenantId: string,
    input: {
      contactId: string;
      endsAt: string;
      idempotencyKey: string;
      resourceId: string;
      startsAt: string;
      title: string;
    },
  ): Promise<{ appointment: AppointmentRecord; conflict: boolean; created: boolean }>;
}

export class InMemoryLeadsRepository extends LeadsRepository {
  private readonly leads = new Map<string, LeadRecord>();
  private readonly appointments = new Map<string, AppointmentRecord>();
  private readonly idemIndex = new Map<string, string>();

  seedLead(lead: Omit<LeadRecord, 'id'> & { id?: string }): LeadRecord {
    const record: LeadRecord = { ...lead, id: lead.id ?? randomUUID() };
    this.leads.set(record.id, record);
    return record;
  }

  override async listLeads(tenantId: string): Promise<LeadRecord[]> {
    return [...this.leads.values()].filter((lead) => lead.tenantId === tenantId);
  }

  override async listAppointments(tenantId: string): Promise<AppointmentRecord[]> {
    return [...this.appointments.values()].filter(
      (appointment) => appointment.tenantId === tenantId,
    );
  }

  override async qualifyLead(
    tenantId: string,
    leadId: string,
    score: number,
  ): Promise<LeadRecord | null> {
    const lead = this.leads.get(leadId);
    if (!lead || lead.tenantId !== tenantId) return null;
    lead.stage = lead.stage === 'NEW' || lead.stage === 'CONTACTED' ? 'QUALIFIED' : lead.stage;
    lead.score = Math.max(0, Math.min(100, score));
    return lead;
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
    const idemKey = `${tenantId}:${input.resourceId}:${input.startsAt}:${input.idempotencyKey}`;
    const existingId = this.idemIndex.get(idemKey);
    if (existingId) {
      const existing = this.appointments.get(existingId);
      if (!existing) throw new Error('idempotency index dangling');
      return { appointment: existing, conflict: false, created: false };
    }
    const overlap = [...this.appointments.values()].find(
      (appointment) =>
        appointment.tenantId === tenantId &&
        appointment.resourceId === input.resourceId &&
        appointment.status === 'CONFIRMED' &&
        new Date(appointment.startsAt) < new Date(input.endsAt) &&
        new Date(appointment.endsAt) > new Date(input.startsAt),
    );
    if (overlap) {
      return { appointment: overlap, conflict: true, created: false };
    }
    const appointment: AppointmentRecord = {
      contactId: input.contactId,
      endsAt: input.endsAt,
      id: randomUUID(),
      resourceId: input.resourceId,
      startsAt: input.startsAt,
      status: 'CONFIRMED',
      tenantId,
      title: input.title,
    };
    this.appointments.set(appointment.id, appointment);
    this.idemIndex.set(idemKey, appointment.id);
    return { appointment, conflict: false, created: true };
  }
}
