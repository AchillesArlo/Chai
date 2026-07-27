import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import {
  API_CONTACT_ID,
  API_TENANT_B_ID,
  API_TENANT_ID,
} from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresTicketRepository } from '../../src/modules/ticket/postgres-ticket.repository';

describe('API Postgres ticket repository (D1)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('persists a ticket with tags, updates it, and stores comments', async () => {
    const writer = new PostgresTicketRepository(runtime);
    const created = await writer.createTicket(API_TENANT_ID, {
      assignedTo: null,
      category: 'billing',
      contactId: API_CONTACT_ID,
      conversationId: null,
      description: 'Cannot log in',
      priority: 'HIGH',
      slaDefinitionId: null,
      status: 'OPEN',
      subject: 'Login issue',
      tags: ['login', 'urgent'],
    });

    const reader = new PostgresTicketRepository(runtime);
    const fetched = await reader.getTicket(API_TENANT_ID, created.id);
    expect(fetched?.subject).toBe('Login issue');
    expect(fetched?.tags).toEqual(['login', 'urgent']);

    const resolvedAt = new Date().toISOString();
    const updated = await reader.updateTicket(API_TENANT_ID, created.id, {
      resolvedAt,
      status: 'RESOLVED',
    });
    expect(updated.status).toBe('RESOLVED');
    expect(updated.resolvedAt).toBeTruthy();

    await reader.createComment(API_TENANT_ID, {
      authorId: API_CONTACT_ID,
      body: 'Looking into this',
      isInternal: true,
      ticketId: created.id,
    });
    const comments = await new PostgresTicketRepository(runtime).listComments(
      API_TENANT_ID,
      created.id,
    );
    expect(comments).toHaveLength(1);
    expect(comments[0]?.isInternal).toBe(true);
  });

  it('isolates tickets by tenant under RLS', async () => {
    const repo = new PostgresTicketRepository(runtime);
    const mine = await repo.createTicket(API_TENANT_ID, {
      assignedTo: null,
      category: null,
      contactId: null,
      conversationId: null,
      description: null,
      priority: 'LOW',
      slaDefinitionId: null,
      status: 'OPEN',
      subject: 'private ticket',
      tags: [],
    });

    const cross = await repo.listTickets(API_TENANT_B_ID);
    expect(cross.some((row) => row.id === mine.id)).toBe(false);
    expect(await repo.getTicket(API_TENANT_B_ID, mine.id)).toBeNull();
  });
});
