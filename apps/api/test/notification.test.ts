import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryNotificationRepository } from '../src/modules/notification/notification.repository';

describe('NotificationRepository', () => {
  let repo: InMemoryNotificationRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryNotificationRepository();
  });

  it('should create notification', async () => {
    const notification = await repo.createNotification(tenantId, {
      userId: 'user-123',
      type: 'IN_APP',
      title: 'Ticket Updated',
      body: 'Your ticket #123 has been updated',
      channel: 'in_app',
      status: 'PENDING',
      metadata: {},
    });

    expect(notification.id).toBeDefined();
    expect(notification.userId).toBe('user-123');
    expect(notification.type).toBe('IN_APP');
    expect(notification.status).toBe('PENDING');
  });

  it('should list notifications by user', async () => {
    await repo.createNotification(tenantId, {
      userId: 'user-1',
      type: 'IN_APP',
      title: 'New Message',
      body: 'You have a new message',
      channel: 'in_app',
      status: 'PENDING',
      metadata: {},
    });

    await repo.createNotification(tenantId, {
      userId: 'user-1',
      type: 'EMAIL',
      title: 'Ticket Update',
      body: 'Your ticket has been updated',
      channel: 'email',
      status: 'SENT',
      metadata: {},
    });

    const notifications = await repo.listNotifications(tenantId, 'user-1');
    expect(notifications).toHaveLength(2);
  });

  it('should mark notification as read', async () => {
    const notification = await repo.createNotification(tenantId, {
      userId: 'user-1',
      type: 'IN_APP',
      title: 'Test',
      body: 'Test message',
      channel: 'in_app',
      status: 'PENDING',
      metadata: {},
    });

    const updated = await repo.markAsRead(tenantId, notification.id);
    expect(updated.status).toBe('READ');
    expect(updated.readAt).toBeDefined();
  });

  it('should update notification', async () => {
    const notification = await repo.createNotification(tenantId, {
      userId: 'user-1',
      type: 'IN_APP',
      title: 'Test',
      body: 'Test message',
      channel: 'in_app',
      status: 'PENDING',
      metadata: {},
    });

    const updated = await repo.updateNotification(tenantId, notification.id, {
      status: 'SENT',
      sentAt: new Date().toISOString(),
    });

    expect(updated.status).toBe('SENT');
    expect(updated.sentAt).toBeDefined();
  });
});
