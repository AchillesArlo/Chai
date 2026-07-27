import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import {
  API_CHANNEL_ACCOUNT_ID,
  API_CONTACT_ID,
  API_TENANT_B_ID,
  API_TENANT_ID,
} from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAIAgentRepository } from '../../src/modules/ai-agent/postgres-ai-agent.repository';

describe('API Postgres ai-agent repository (D1)', () => {
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

  it('persists a profile, updates it, and isolates it by tenant', async () => {
    const writer = new PostgresAIAgentRepository(runtime);
    const created = await writer.createProfile(API_TENANT_ID, {
      businessRules: { maxRetries: 3 },
      handoverPolicy: { afterAttempts: 5 },
      language: 'id',
      name: 'Support Bot',
      status: 'ACTIVE',
      tone: 'friendly',
      useCase: 'customer_support',
    });

    const reader = new PostgresAIAgentRepository(runtime);
    const fetched = await reader.getProfile(API_TENANT_ID, created.id);
    expect(fetched?.name).toBe('Support Bot');
    expect(fetched?.businessRules).toEqual({ maxRetries: 3 });

    const updated = await reader.updateProfile(API_TENANT_ID, created.id, {
      status: 'PAUSED',
    });
    expect(updated.status).toBe('PAUSED');
    const reread = await new PostgresAIAgentRepository(runtime).getProfile(
      API_TENANT_ID,
      created.id,
    );
    expect(reread?.status).toBe('PAUSED');

    expect(await reader.getProfile(API_TENANT_B_ID, created.id)).toBeNull();
    const crossList = await reader.listProfiles(API_TENANT_B_ID);
    expect(crossList.some((profile) => profile.id === created.id)).toBe(false);
  });

  it('persists sessions and tool policies, and honours the delete grant', async () => {
    const repo = new PostgresAIAgentRepository(runtime);
    const profile = await repo.createProfile(API_TENANT_ID, {
      businessRules: {},
      handoverPolicy: {},
      language: 'id',
      name: 'Session Bot',
      status: 'ACTIVE',
      tone: null,
      useCase: 'support',
    });

    const conversationId = randomUUID();
    await admin`
      INSERT INTO chai.conversation (id, tenant_id, contact_id, channel_account_id)
      VALUES (${conversationId}, ${API_TENANT_ID}, ${API_CONTACT_ID}, ${API_CHANNEL_ACCOUNT_ID})
    `;

    const session = await repo.createSession(API_TENANT_ID, {
      agentProfileId: profile.id,
      context: { customerName: 'Ana' },
      conversationId,
      status: 'ACTIVE',
    });
    expect(session.messagesCount).toBe(0);
    expect(session.startedAt).toBeTruthy();

    const sessionReader = new PostgresAIAgentRepository(runtime);
    const fetchedSession = await sessionReader.getSession(API_TENANT_ID, session.id);
    expect(fetchedSession?.context).toEqual({ customerName: 'Ana' });
    expect(
      (await sessionReader.listSessions(API_TENANT_B_ID)).some(
        (row) => row.id === session.id,
      ),
    ).toBe(false);

    const policy = await repo.createToolPolicy(API_TENANT_ID, {
      allowed: true,
      constraints: { maxPerMinute: 10 },
      toolName: 'send_message',
    });
    const policies = await new PostgresAIAgentRepository(runtime).listToolPolicies(
      API_TENANT_ID,
    );
    expect(policies.some((row) => row.id === policy.id && row.allowed)).toBe(true);

    // deleteProfile exercises the DELETE grant added in migration 0053. Use a
    // throwaway profile with no session so no FK blocks the delete.
    const disposable = await repo.createProfile(API_TENANT_ID, {
      businessRules: {},
      handoverPolicy: {},
      language: 'id',
      name: 'Delete Me',
      status: 'DRAFT',
      tone: null,
      useCase: 'test',
    });
    await repo.deleteProfile(API_TENANT_ID, disposable.id);
    expect(await repo.getProfile(API_TENANT_ID, disposable.id)).toBeNull();

    await repo.deleteToolPolicy(API_TENANT_ID, policy.id);
    expect(
      (await repo.listToolPolicies(API_TENANT_ID)).some((row) => row.id === policy.id),
    ).toBe(false);
  });
});
