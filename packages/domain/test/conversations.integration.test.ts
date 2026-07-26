import { createDatabase, withTenantTransaction } from '@chai/database';
import { inject } from 'vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  ingestInboundEvent,
  listConversations,
  resolveConversation,
  takeOverConversation,
} from '../src/conversations';
import {
  DOMAIN_IDS,
  resetConversationTables,
  seedFoundation,
} from './fixtures';

const TENANT_A = DOMAIN_IDS.tenantA;
const TENANT_B = DOMAIN_IDS.tenantB;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const CHANNEL_ACCOUNT = DOMAIN_IDS.providerAccountA;

const tenantAContext = { principalId: PRINCIPAL_A, tenantId: TENANT_A };
const tenantBContext = { principalId: PRINCIPAL_A, tenantId: TENANT_B };

describe('conversations — inbound ingestion and tenant isolation', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('runtimeDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetConversationTables(adminDatabaseUrl);
  });

  it('creates a contact, conversation, and message from a first inbound event', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const result = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        ingestInboundEvent(tx, {
          channelAccount: CHANNEL_ACCOUNT,
          content: { contentType: 'TEXT', text: 'Halo, saya mau booking' },
          externalEventId: 'evt-first',
          externalMessageId: 'msg-first',
          externalUserId: 'customer-1',
          provider: 'mock-channel',
          providerTimestamp: new Date(),
          tenantId: TENANT_A,
        }),
      );

      expect(result.created).toBe(true);
      expect(result.contact.id).toBeTruthy();
      expect(result.conversation.id).toBeTruthy();
      expect(result.message.id).toBeTruthy();
    } finally {
      await runtime.end();
    }
  });

  it('reuses the same contact and conversation for repeat inbound from one user', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const first = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        ingestInboundEvent(tx, {
          channelAccount: CHANNEL_ACCOUNT,
          content: { contentType: 'TEXT', text: 'first' },
          externalEventId: 'evt-a',
          externalMessageId: 'msg-a',
          externalUserId: 'customer-repeat',
          provider: 'mock-channel',
          providerTimestamp: new Date(),
          tenantId: TENANT_A,
        }),
      );
      const second = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        ingestInboundEvent(tx, {
          channelAccount: CHANNEL_ACCOUNT,
          content: { contentType: 'TEXT', text: 'second' },
          externalEventId: 'evt-b',
          externalMessageId: 'msg-b',
          externalUserId: 'customer-repeat',
          provider: 'mock-channel',
          providerTimestamp: new Date(),
          tenantId: TENANT_A,
        }),
      );

      expect(second.created).toBe(false);
      expect(second.contact.id).toBe(first.contact.id);
      expect(second.conversation.id).toBe(first.conversation.id);
    } finally {
      await runtime.end();
    }
  });

  it('is idempotent on the external message id (duplicate webhook is harmless)', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const first = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        ingestInboundEvent(tx, {
          channelAccount: CHANNEL_ACCOUNT,
          content: { contentType: 'TEXT', text: 'dup' },
          externalEventId: 'evt-dup',
          externalMessageId: 'msg-dup',
          externalUserId: 'customer-dup',
          provider: 'mock-channel',
          providerTimestamp: new Date(),
          tenantId: TENANT_A,
        }),
      );

      // Replay the same external message id — must not insert a second message.
      const replay = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        ingestInboundEvent(tx, {
          channelAccount: CHANNEL_ACCOUNT,
          content: { contentType: 'TEXT', text: 'dup' },
          externalEventId: 'evt-dup-replay',
          externalMessageId: 'msg-dup',
          externalUserId: 'customer-dup',
          provider: 'mock-channel',
          providerTimestamp: new Date(),
          tenantId: TENANT_A,
        }),
      );

      expect(replay.message.id).toBe(first.message.id);
      expect(replay.created).toBe(false);
    } finally {
      await runtime.end();
    }
  });

  it('never lets one tenant see another tenant conversations', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      await withTenantTransaction(runtime, tenantAContext, (tx) =>
        ingestInboundEvent(tx, {
          channelAccount: CHANNEL_ACCOUNT,
          content: { contentType: 'TEXT', text: 'tenant A only' },
          externalEventId: 'evt-iso-a',
          externalMessageId: 'msg-iso-a',
          externalUserId: 'customer-iso',
          provider: 'mock-channel',
          providerTimestamp: new Date(),
          tenantId: TENANT_A,
        }),
      );

      const tenantAConversations = await withTenantTransaction(
        runtime,
        tenantAContext,
        (tx) => listConversations(tx),
      );
      const tenantBConversations = await withTenantTransaction(
        runtime,
        tenantBContext,
        (tx) => listConversations(tx),
      );

      expect(tenantAConversations.length).toBe(1);
      expect(tenantBConversations).toEqual([]);
    } finally {
      await runtime.end();
    }
  });

  it('takes over a conversation into HUMAN_ACTIVE and resolves it', async () => {
    const runtime = createDatabase(runtimeDatabaseUrl);
    try {
      const ingested = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        ingestInboundEvent(tx, {
          channelAccount: CHANNEL_ACCOUNT,
          content: { contentType: 'TEXT', text: 'need a human' },
          externalEventId: 'evt-takeover',
          externalMessageId: 'msg-takeover',
          externalUserId: 'customer-takeover',
          provider: 'mock-channel',
          providerTimestamp: new Date(),
          tenantId: TENANT_A,
        }),
      );

      const taken = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        takeOverConversation(tx, ingested.conversation.id, PRINCIPAL_A),
      );
      expect(taken?.mode).toBe('HUMAN_ACTIVE');

      const resolved = await withTenantTransaction(runtime, tenantAContext, (tx) =>
        resolveConversation(tx, ingested.conversation.id),
      );
      expect(resolved?.status).toBe('RESOLVED');
      expect(resolved?.mode).toBe('PAUSED');

      // Cross-tenant takeover must not touch tenant A's conversation.
      const cross = await withTenantTransaction(runtime, tenantBContext, (tx) =>
        takeOverConversation(tx, ingested.conversation.id, PRINCIPAL_A),
      );
      expect(cross).toBeNull();
    } finally {
      await runtime.end();
    }
  });
});
