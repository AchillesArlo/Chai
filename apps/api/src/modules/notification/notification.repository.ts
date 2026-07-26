import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: 'IN_APP' | 'EMAIL' | 'PUSH';
  title: string;
  body: string;
  channel: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  metadata: Record<string, unknown>; // free-form JSONB (schema-less)
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class NotificationRepository {
  abstract listNotifications(tenantId: string, userId?: string): Promise<Notification[]>;
  abstract getNotification(tenantId: string, id: string): Promise<Notification | null>;
  abstract createNotification(tenantId: string, notification: Omit<Notification, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'sentAt' | 'readAt'>): Promise<Notification>;
  abstract updateNotification(tenantId: string, id: string, update: Partial<Notification>): Promise<Notification>;
  abstract markAsRead(tenantId: string, id: string): Promise<Notification>;
}

@Injectable()
export class InMemoryNotificationRepository extends NotificationRepository {
  private notifications = new Map<string, Notification>();

  async listNotifications(tenantId: string, userId?: string): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(
      n => n.tenantId === tenantId && (!userId || n.userId === userId)
    );
  }

  async getNotification(tenantId: string, id: string): Promise<Notification | null> {
    const n = this.notifications.get(id);
    return n && n.tenantId === tenantId ? n : null;
  }

  async createNotification(tenantId: string, notification: Omit<Notification, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'sentAt' | 'readAt'>): Promise<Notification> {
    const now = new Date().toISOString();
    const created = { ...notification, tenantId, id: randomUUID(), sentAt: null, readAt: null, createdAt: now, updatedAt: now };
    this.notifications.set(created.id, created);
    return created;
  }

  async updateNotification(tenantId: string, id: string, update: Partial<Notification>): Promise<Notification> {
    const existing = this.notifications.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Notification not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.notifications.set(id, updated);
    return updated;
  }

  async markAsRead(tenantId: string, id: string): Promise<Notification> {
    return this.updateNotification(tenantId, id, { status: 'READ', readAt: new Date().toISOString() });
  }
}
