import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Widget {
  id: string;
  tenantId: string;
  name: string;
  domain: string;
  widgetType: 'chat' | 'contact_form' | 'faq' | 'hybrid';
  theme: Record<string, unknown>; // free-form JSONB (schema-less)
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  language: string;
  greetingMessage: string | null;
  offlineMessage: string | null;
  businessHours: Record<string, unknown> | null;
  allowedOrigins: string[];
  status: 'active' | 'inactive' | 'maintenance';
  embedCode: string | null;
  analyticsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetSession {
  id: string;
  widgetId: string;
  tenantId: string;
  visitorId: string | null;
  contactId: string | null;
  conversationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  referrerUrl: string | null;
  landingPage: string | null;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'ended' | 'abandoned';
  metadata: Record<string, unknown>;
}

export abstract class WidgetRepository {
  abstract listWidgets(tenantId: string): Promise<Widget[]>;
  abstract getWidget(tenantId: string, id: string): Promise<Widget | null>;
  abstract createWidget(tenantId: string, widget: Omit<Widget, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Widget>;
  abstract updateWidget(tenantId: string, id: string, update: Partial<Widget>): Promise<Widget>;
  abstract deleteWidget(tenantId: string, id: string): Promise<void>;

  abstract listSessions(widgetId: string, status?: string): Promise<WidgetSession[]>;
  abstract getSession(id: string): Promise<WidgetSession | null>;
  abstract createSession(session: Omit<WidgetSession, 'id' | 'endedAt'>): Promise<WidgetSession>;
  abstract updateSession(id: string, update: Partial<WidgetSession>): Promise<WidgetSession>;
}

@Injectable()
export class InMemoryWidgetRepository extends WidgetRepository {
  private widgets = new Map<string, Widget>();
  private sessions = new Map<string, WidgetSession>();

  async listWidgets(tenantId: string): Promise<Widget[]> {
    return Array.from(this.widgets.values()).filter(w => w.tenantId === tenantId);
  }

  async getWidget(tenantId: string, id: string): Promise<Widget | null> {
    const w = this.widgets.get(id);
    return w && w.tenantId === tenantId ? w : null;
  }

  async createWidget(tenantId: string, widget: Omit<Widget, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Widget> {
    const now = new Date().toISOString();
    const created = { ...widget, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.widgets.set(created.id, created);
    return created;
  }

  async updateWidget(tenantId: string, id: string, update: Partial<Widget>): Promise<Widget> {
    const existing = this.widgets.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Widget not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.widgets.set(id, updated);
    return updated;
  }

  async deleteWidget(tenantId: string, id: string): Promise<void> {
    const existing = this.widgets.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Widget not found');
    this.widgets.delete(id);
  }

  async listSessions(widgetId: string, status?: string): Promise<WidgetSession[]> {
    return Array.from(this.sessions.values()).filter(
      s => s.widgetId === widgetId && (!status || s.status === status)
    );
  }

  async getSession(id: string): Promise<WidgetSession | null> {
    return this.sessions.get(id) || null;
  }

  async createSession(session: Omit<WidgetSession, 'id' | 'endedAt'>): Promise<WidgetSession> {
    const created = { ...session, id: randomUUID(), endedAt: null };
    this.sessions.set(created.id, created);
    return created;
  }

  async updateSession(id: string, update: Partial<WidgetSession>): Promise<WidgetSession> {
    const existing = this.sessions.get(id);
    if (!existing) throw new Error('Widget session not found');
    const updated = { ...existing, ...update };
    this.sessions.set(id, updated);
    return updated;
  }
}
