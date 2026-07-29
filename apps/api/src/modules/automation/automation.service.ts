import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { withTenantTransaction, type Database } from '@chai/database';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
  type DatabaseHandle,
} from '../../database/database.module';

export interface ScheduleFollowUpResult {
  id: string;
  dueAt: string;
  status: string;
}

// ponytail: in-memory path returns 501 until automation jobs table mirror exists; Postgres path is the production path.
@Injectable()
export class AutomationService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async scheduleFollowUp(
    tenantId: string,
    conversationId: string | null,
    dueAt: Date,
    payload: Record<string, unknown>,
    maxAttempts = 3,
  ): Promise<ScheduleFollowUpResult> {
    if (!this.database) {
      // ponytail: in-memory path returns 501 until automation jobs table mirror exists; Postgres path is the production path.
      const error = new Error('Automation scheduling requires a Postgres handle');
      (error as { status?: number }).status = 501;
      throw error;
    }
    return this.schedulePostgres(
      this.database,
      tenantId,
      conversationId,
      dueAt,
      payload,
      maxAttempts,
    );
  }

  private async schedulePostgres(
    database: Database,
    tenantId: string,
    conversationId: string | null,
    dueAt: Date,
    payload: Record<string, unknown>,
    maxAttempts: number,
  ): Promise<ScheduleFollowUpResult> {
    const id = randomUUID();
    const principal = { principalId: SERVICE_PRINCIPAL_ID, tenantId };
    const row = await withTenantTransaction(database, principal, async (tx) => {
      const rows = await tx<{ id: string; status: string; due_at: Date }[]>`
        INSERT INTO chai.follow_up_job
          (id, tenant_id, conversation_id, due_at, max_attempts, payload)
        VALUES
          (${id}, ${tenantId}, ${conversationId}, ${dueAt},
           ${maxAttempts}, ${tx.json(payload as Parameters<typeof tx.json>[0])})
        RETURNING id, status, due_at
      `;
      // INSERT ... RETURNING always yields exactly one row for the inserted id.
      const inserted = rows[0];
      if (!inserted) throw new Error('follow_up_job insert returned no row');
      return inserted;
    });
    return {
      id: row.id,
      dueAt: row.due_at.toISOString(),
      status: row.status,
    };
  }
}
