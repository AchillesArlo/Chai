import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';
import { evaluateToolPolicy } from '@chai/domain';

import { API_CONTACT_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresActionsRepository } from '../../src/modules/actions/postgres-actions.repository';
import { hasExecutor } from '../../src/modules/actions/tool-executors';
import { KnowledgeActionAdapter } from '../../src/modules/knowledge/knowledge-action.adapter';
import { PostgresKnowledgeRepository } from '../../src/modules/knowledge/postgres-knowledge.repository';
import { LeadsActionAdapter } from '../../src/modules/leads/leads-action.adapter';
import { PostgresLeadsRepository } from '../../src/modules/leads/postgres-leads.repository';
import { LogisticsActionAdapter } from '../../src/modules/logistics/logistics-action.adapter';
import { PostgresLogisticsRepository } from '../../src/modules/logistics/postgres-logistics.repository';
import { PaymentsActionAdapter } from '../../src/modules/payments/payments-action.adapter';
import { PostgresPaymentsRepository } from '../../src/modules/payments/postgres-payments.repository';

/**
 * REQ-08-008/REQ-08-021/REQ-09-034 (FASE 4): the tool execution path this
 * repository backs did not exist anywhere before this — POST /actions/evaluate
 * only ever returned a policy decision, it never ran anything. These tests
 * prove the wiring end to end against real Postgres: policy gate, idempotent
 * ActionRequest, audit + event in the same transaction, and unimplemented
 * tools failing closed instead of silently succeeding.
 */
describe('ActionsRepository.execute (FASE 4 tool execution)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;
  let actions: PostgresActionsRepository;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);

    actions = new PostgresActionsRepository(
      runtime,
      new KnowledgeActionAdapter(new PostgresKnowledgeRepository(runtime)),
      new LeadsActionAdapter(new PostgresLeadsRepository(runtime)),
      new LogisticsActionAdapter(new PostgresLogisticsRepository(runtime)),
      new PaymentsActionAdapter(new PostgresPaymentsRepository(runtime)),
    );
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('executes knowledge.search and records a SUCCEEDED ActionRequest with audit + event', async () => {
    const decision = evaluateToolPolicy({
      confirmed: false,
      entitlements: [],
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'knowledge.search',
    });
    expect(decision.kind).toBe('ALLOW');
    if (decision.kind !== 'ALLOW') return;

    const record = await actions.execute({
      idempotencyKey: `action-search-${Date.now()}`,
      origin: 'ai',
      parameters: { query: 'refund policy', knowledgeBaseIds: [] },
      riskTier: decision.risk,
      tenantId: API_TENANT_ID,
      tool: 'knowledge.search',
    });

    expect(record.status).toBe('SUCCEEDED');
    expect(record.tool).toBe('knowledge.search');
    expect(Array.isArray(record.result)).toBe(true);

    const audit = await admin<{ action: string }[]>`
      SELECT action FROM chai.audit_log
      WHERE tenant_id = ${API_TENANT_ID} AND resource_id = ${record.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(audit[0]?.action).toBe('tool.knowledge.search.executed');

    const events = await admin<{ event_type: string }[]>`
      SELECT event_type FROM chai.outbox_event
      WHERE tenant_id = ${API_TENANT_ID} AND aggregate_id = ${record.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(events[0]?.event_type).toBe('action.succeeded');
  });

  it('repeating the same idempotency key returns the prior outcome, not a second execution', async () => {
    const idempotencyKey = `action-idem-${Date.now()}`;
    const decision = evaluateToolPolicy({
      confirmed: false,
      entitlements: [],
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'knowledge.search',
    });
    if (decision.kind !== 'ALLOW') throw new Error('expected ALLOW');

    const first = await actions.execute({
      idempotencyKey,
      origin: 'ai',
      parameters: { query: 'warranty', knowledgeBaseIds: [] },
      riskTier: decision.risk,
      tenantId: API_TENANT_ID,
      tool: 'knowledge.search',
    });
    const second = await actions.execute({
      idempotencyKey,
      origin: 'ai',
      parameters: { query: 'warranty', knowledgeBaseIds: [] },
      riskTier: decision.risk,
      tenantId: API_TENANT_ID,
      tool: 'knowledge.search',
    });

    expect(second.id).toBe(first.id);

    const rows = await admin<{ count: number }[]>`
      SELECT count(*)::int AS count FROM chai.action_request
      WHERE tenant_id = ${API_TENANT_ID} AND idempotency_key = ${idempotencyKey}
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it('refuses a catalog tool with no wired executor (fails closed, not silently allowed)', async () => {
    // appointment.reschedule is in TOOL_CATALOG (policy would ALLOW it) but
    // has no repository method yet, so hasExecutor() must be false and
    // execute() must refuse rather than pretend to run it.
    expect(hasExecutor('appointment.reschedule')).toBe(false);

    await expect(
      actions.execute({
        idempotencyKey: `action-notimpl-${Date.now()}`,
        origin: 'human',
        parameters: {},
        riskTier: 'MEDIUM',
        tenantId: API_TENANT_ID,
        tool: 'appointment.reschedule',
      }),
    ).rejects.toThrow('TOOL_NOT_IMPLEMENTED');

    // Nothing was recorded — a refusal at this stage must not leave a row
    // that looks like a real attempt.
    const rows = await admin<{ count: number }[]>`
      SELECT count(*)::int AS count FROM chai.action_request
      WHERE tenant_id = ${API_TENANT_ID} AND tool = 'appointment.reschedule'
    `;
    expect(rows[0]?.count).toBe(0);
  });

  it('books an appointment via appointment.create and the row is visible under RLS', async () => {
    const decision = evaluateToolPolicy({
      confirmed: true,
      entitlements: [],
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'appointment.create',
    });
    expect(decision.kind).toBe('ALLOW');
    if (decision.kind !== 'ALLOW') return;

    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();
    const record = await actions.execute({
      idempotencyKey: `action-book-${Date.now()}`,
      origin: 'ai',
      parameters: {
        contactId: API_CONTACT_ID,
        endsAt,
        idempotencyKey: `book-fase4-${Date.now()}`,
        resourceId: 'resource-fase4-test',
        startsAt,
        title: 'FASE 4 test booking',
      },
      riskTier: decision.risk,
      tenantId: API_TENANT_ID,
      tool: 'appointment.create',
    });

    expect(record.status).toBe('SUCCEEDED');
    const result = record.result as { id: string } | null;
    expect(result?.id).toBeTruthy();
  });
});
