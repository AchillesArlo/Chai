import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'BOOKED' | 'LOST' | 'WON';

export interface LeadSummary {
  contactId: string;
  id: string;
  score: number;
  stage: LeadStage;
  status: string;
}

export interface BookingInput {
  contactId: string;
  endsAt: Date;
  idempotencyKey: string;
  resourceId: string;
  startsAt: Date;
  tenantId: string;
  title: string;
}

export interface BookingResult {
  appointmentId: string;
  created: boolean;
  overlapConflict: boolean;
}

interface LeadRow {
  contact_id: string;
  id: string;
  score: number;
  stage: LeadStage;
  status: string;
}

interface AppointmentRow {
  id: string;
}

/**
 * Qualifies a lead: promotes it to QUALIFIED and records a normalized score.
 * Returns null if the lead is not visible under the current tenant.
 */
export async function qualifyLead(
  transaction: DatabaseTransaction,
  leadId: string,
  score: number,
): Promise<LeadSummary | null> {
  const clamped = Math.max(0, Math.min(100, Math.trunc(score)));
  const rows = await transaction<LeadRow[]>`
    UPDATE chai.lead
    SET stage = CASE
        WHEN status = 'OPEN' AND stage IN ('NEW', 'CONTACTED') THEN 'QUALIFIED'
        ELSE stage
      END,
      score = ${clamped},
      version = version + 1
    WHERE id = ${leadId}
    RETURNING id, contact_id, stage, status, score
  `;
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function listLeads(
  transaction: DatabaseTransaction,
): Promise<LeadSummary[]> {
  const rows = await transaction<LeadRow[]>`
    SELECT id, contact_id, stage, status, score
    FROM chai.lead
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return rows.map(toSummary);
}

/**
 * Books an appointment idempotently and rejects overlapping slots.
 *
 * Idempotency collapses a duplicate create (same tenant+resource+start+key) to
 * the original appointment. The overlap guard rejects a genuinely new booking
 * that overlaps an existing CONFIRMED/RESCHEDULED appointment on the same
 * resource — re-evaluating current state immediately before insert.
 */
export async function bookAppointment(
  transaction: DatabaseTransaction,
  input: BookingInput,
): Promise<BookingResult> {
  const existing = await transaction<AppointmentRow[]>`
    SELECT id FROM chai.appointment
    WHERE resource_id = ${input.resourceId}
      AND starts_at = ${input.startsAt}
      AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  if (existing[0]) {
    return { appointmentId: existing[0].id, created: false, overlapConflict: false };
  }

  const overlap = await transaction<{ id: string }[]>`
    SELECT id FROM chai.appointment
    WHERE resource_id = ${input.resourceId}
      AND status IN ('CONFIRMED', 'RESCHEDULED')
      AND starts_at < ${input.endsAt}
      AND ends_at > ${input.startsAt}
    LIMIT 1
  `;
  if (overlap[0]) {
    return { appointmentId: '', created: false, overlapConflict: true };
  }

  const inserted = await transaction<AppointmentRow[]>`
    INSERT INTO chai.appointment (
      id, tenant_id, contact_id, resource_id, status,
      starts_at, ends_at, title, idempotency_key
    )
    VALUES (
      ${randomUUID()}, chai.current_tenant_id(), ${input.contactId},
      ${input.resourceId}, 'CONFIRMED',
      ${input.startsAt}, ${input.endsAt}, ${input.title}, ${input.idempotencyKey}
    )
    RETURNING id
  `;
  const row = inserted[0];
  if (!row) throw new Error('appointment insert returned no row');
  return { appointmentId: row.id, created: true, overlapConflict: false };
}

/**
 * Cancels an appointment. Returns null if it is not visible under the current
 * tenant or already terminal.
 */
export async function cancelAppointment(
  transaction: DatabaseTransaction,
  appointmentId: string,
): Promise<{ id: string; status: string } | null> {
  const rows = await transaction<{ id: string; status: string }[]>`
    UPDATE chai.appointment
    SET status = 'CANCELLED',
        version = version + 1
    WHERE id = ${appointmentId}
      AND status IN ('CONFIRMED', 'RESCHEDULED')
    RETURNING id, status
  `;
  return rows[0] ?? null;
}

function toSummary(row: LeadRow): LeadSummary {
  return {
    contactId: row.contact_id,
    id: row.id,
    score: row.score,
    stage: row.stage,
    status: row.status,
  };
}
