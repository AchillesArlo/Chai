import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import {
  API_CLIENT_OWNER_ID,
  API_TENANT_B_ID,
  API_TENANT_ID,
} from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresNotificationRepository } from '../../src/modules/notification/postgres-notification.repository';

describe('API Postgres notification repository (D1)', () => {
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

  it('persists a notification and marks it read through a fresh repo', async () => {
    const writer = new PostgresNotificationRepository(runtime);
    const created = await writer.createNotification(API_TENANT_ID, {
      body: 'Your ticket was updated',
      channel: 'in_app',
      metadata: { ticketId: 'abc' },
      status: 'PENDING',
      title: 'Ticket Updated',
      type: 'IN_APP',
      userId: API_CLIENT_OWNER_ID,
    });
    expect(created.readAt).toBeNull();

    const reader = new PostgresNotificationRepository(runtime);
    const listed = await reader.listNotifications(API_TENANT_ID, API_CLIENT_OWNER_ID);
    expect(listed.some((row) => row.id === created.id)).toBe(true);

    const read = await reader.markAsRead(API_TENANT_ID, created.id);
    expect(read.status).toBe('READ');
    expect(read.readAt).toBeTruthy();

    const reread = await new PostgresNotificationRepository(runtime).getNotification(
      API_TENANT_ID,
      created.id,
    );
    expect(reread?.status).toBe('READ');
  });

  it('isolates notifications by tenant under RLS', async () => {
    const repo = new PostgresNotificationRepository(runtime);
    const mine = await repo.createNotification(API_TENANT_ID, {
      body: 'private',
      channel: null,
      metadata: {},
      status: 'PENDING',
      title: 'Private',
      type: 'IN_APP',
      userId: API_CLIENT_OWNER_ID,
    });

    const cross = await repo.listNotifications(API_TENANT_B_ID);
    expect(cross.some((row) => row.id === mine.id)).toBe(false);
    expect(await repo.getNotification(API_TENANT_B_ID, mine.id)).toBeNull();
  });

  it('stores metadata as a real jsonb object, not a double-encoded string (MASALAH-01)', async () => {
    const repo = new PostgresNotificationRepository(runtime);
    const created = await repo.createNotification(API_TENANT_ID, {
      body: 'jsonb probe',
      channel: 'in_app',
      metadata: { ticketId: 'probe-1' },
      status: 'PENDING',
      title: 'Jsonb Probe',
      type: 'IN_APP',
      userId: API_CLIENT_OWNER_ID,
    });

    // A double-encoded write reads back as jsonb_typeof = 'string' and
    // `->> 'key'` = NULL for every key: this is the regression 0078 repairs.
    const shape = await admin<{ typeof: string; val: string | null }[]>`
      SELECT jsonb_typeof(metadata) AS typeof, metadata ->> 'ticketId' AS val
      FROM chai.notification WHERE id = ${created.id}::uuid
    `;
    expect(shape[0]?.typeof).toBe('object');
    expect(shape[0]?.val).toBe('probe-1');
  });
});
