import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  TicketRepository,
  type Ticket,
  type TicketComment,
} from './ticket.repository';

interface TicketRow {
  assigned_to: string | null;
  category: string | null;
  closed_at: Date | null;
  contact_id: string | null;
  conversation_id: string | null;
  created_at: Date;
  description: string | null;
  first_response_at: Date | null;
  id: string;
  priority: Ticket['priority'];
  resolved_at: Date | null;
  sla_definition_id: string | null;
  status: Ticket['status'];
  subject: string;
  tags: string[];
  tenant_id: string;
  updated_at: Date;
}

interface TicketCommentRow {
  author_id: string;
  body: string;
  created_at: Date;
  id: string;
  is_internal: boolean;
  tenant_id: string;
  ticket_id: string;
  updated_at: Date;
}

@Injectable()
export class PostgresTicketRepository extends TicketRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listTickets(tenantId: string): Promise<Ticket[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TicketRow[]>`
        SELECT * FROM chai.ticket
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapTicket(row));
    });
  }

  override async getTicket(tenantId: string, id: string): Promise<Ticket | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TicketRow[]>`
        SELECT * FROM chai.ticket
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapTicket(rows[0]) : null;
    });
  }

  override async createTicket(
    tenantId: string,
    ticket: Omit<
      Ticket,
      | 'id'
      | 'tenantId'
      | 'createdAt'
      | 'updatedAt'
      | 'firstResponseAt'
      | 'resolvedAt'
      | 'closedAt'
    >,
  ): Promise<Ticket> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TicketRow[]>`
        INSERT INTO chai.ticket (
          id, tenant_id, contact_id, conversation_id, subject, description,
          priority, status, assigned_to, category, tags, sla_definition_id
        ) VALUES (
          ${id}, ${tenantId}, ${ticket.contactId}, ${ticket.conversationId},
          ${ticket.subject}, ${ticket.description}, ${ticket.priority},
          ${ticket.status}, ${ticket.assignedTo}, ${ticket.category},
          ${ticket.tags}, ${ticket.slaDefinitionId}
        )
        RETURNING *
      `;
      return mapTicket(requireRow(rows));
    });
  }

  override async updateTicket(
    tenantId: string,
    id: string,
    update: Partial<Ticket>,
  ): Promise<Ticket> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.load(tx, tenantId, id);
      if (!existing) throw new Error('Ticket not found');
      const merged = { ...existing, ...update };
      const rows = await tx<TicketRow[]>`
        UPDATE chai.ticket SET
          contact_id = ${merged.contactId},
          conversation_id = ${merged.conversationId},
          subject = ${merged.subject},
          description = ${merged.description},
          priority = ${merged.priority},
          status = ${merged.status},
          assigned_to = ${merged.assignedTo},
          category = ${merged.category},
          tags = ${merged.tags},
          sla_definition_id = ${merged.slaDefinitionId},
          first_response_at = ${merged.firstResponseAt}::timestamptz,
          resolved_at = ${merged.resolvedAt}::timestamptz,
          closed_at = ${merged.closedAt}::timestamptz,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapTicket(requireRow(rows));
    });
  }

  override async listComments(
    tenantId: string,
    ticketId: string,
  ): Promise<TicketComment[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TicketCommentRow[]>`
        SELECT * FROM chai.ticket_comment
        WHERE tenant_id = ${tenantId} AND ticket_id = ${ticketId}
        ORDER BY created_at ASC
      `;
      return rows.map((row) => mapComment(row));
    });
  }

  override async createComment(
    tenantId: string,
    comment: Omit<TicketComment, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<TicketComment> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<TicketCommentRow[]>`
        INSERT INTO chai.ticket_comment (
          id, ticket_id, tenant_id, author_id, is_internal, body
        ) VALUES (
          ${id}, ${comment.ticketId}, ${tenantId}, ${comment.authorId},
          ${comment.isInternal}, ${comment.body}
        )
        RETURNING *
      `;
      return mapComment(requireRow(rows));
    });
  }

  private async load(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Ticket | null> {
    const rows = await tx<TicketRow[]>`
      SELECT * FROM chai.ticket
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  private tx<T>(
    tenantId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      work,
    );
  }
}

function mapTicket(row: TicketRow): Ticket {
  return {
    assignedTo: row.assigned_to,
    category: row.category,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    contactId: row.contact_id,
    conversationId: row.conversation_id,
    createdAt: row.created_at.toISOString(),
    description: row.description,
    firstResponseAt: row.first_response_at
      ? row.first_response_at.toISOString()
      : null,
    id: row.id,
    priority: row.priority,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    slaDefinitionId: row.sla_definition_id,
    status: row.status,
    subject: row.subject,
    tags: row.tags,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapComment(row: TicketCommentRow): TicketComment {
  return {
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    isInternal: row.is_internal,
    tenantId: row.tenant_id,
    ticketId: row.ticket_id,
    updatedAt: row.updated_at.toISOString(),
  };
}


/** First row of a RETURNING result, guarded to avoid a non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}