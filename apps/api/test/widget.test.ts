import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryWidgetRepository } from '../src/modules/widget/widget.repository';

describe('WidgetRepository', () => {
  let repo: InMemoryWidgetRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryWidgetRepository();
  });

  describe('Widgets', () => {
    it('should create widget', async () => {
      const widget = await repo.createWidget(tenantId, {
        name: 'Main Chat Widget',
        domain: 'example.com',
        widgetType: 'chat',
        theme: { primaryColor: '#007bff' },
        position: 'bottom-right',
        language: 'id',
        greetingMessage: 'Hello! How can we help?',
        offlineMessage: 'We are currently offline',
        businessHours: null,
        allowedOrigins: ['https://example.com'],
        status: 'active',
        embedCode: '<script src="widget.js"></script>',
        analyticsEnabled: true,
      });

      expect(widget.id).toBeDefined();
      expect(widget.name).toBe('Main Chat Widget');
      expect(widget.widgetType).toBe('chat');
    });

    it('should list widgets by tenant', async () => {
      await repo.createWidget(tenantId, {
        name: 'Widget 1',
        domain: 'site1.com',
        widgetType: 'chat',
        theme: {},
        position: 'bottom-right',
        language: 'id',
        greetingMessage: null,
        offlineMessage: null,
        businessHours: null,
        allowedOrigins: [],
        status: 'active',
        embedCode: null,
        analyticsEnabled: true,
      });

      const widgets = await repo.listWidgets(tenantId);
      expect(widgets).toHaveLength(1);
    });

    it('should update widget', async () => {
      const widget = await repo.createWidget(tenantId, {
        name: 'Widget',
        domain: 'example.com',
        widgetType: 'chat',
        theme: {},
        position: 'bottom-right',
        language: 'id',
        greetingMessage: null,
        offlineMessage: null,
        businessHours: null,
        allowedOrigins: [],
        status: 'inactive',
        embedCode: null,
        analyticsEnabled: true,
      });

      const updated = await repo.updateWidget(tenantId, widget.id, {
        status: 'active',
      });

      expect(updated.status).toBe('active');
    });
  });

  describe('Widget Sessions', () => {
    it('should create widget session', async () => {
      const widget = await repo.createWidget(tenantId, {
        name: 'Widget',
        domain: 'example.com',
        widgetType: 'chat',
        theme: {},
        position: 'bottom-right',
        language: 'id',
        greetingMessage: null,
        offlineMessage: null,
        businessHours: null,
        allowedOrigins: [],
        status: 'active',
        embedCode: null,
        analyticsEnabled: true,
      });

      const session = await repo.createSession({
        widgetId: widget.id,
        visitorId: 'visitor-123',
        contactId: null,
        conversationId: null,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        referrerUrl: 'https://example.com',
        landingPage: '/home',
        startedAt: new Date().toISOString(),
        status: 'active',
        metadata: {},
      });

      expect(session.id).toBeDefined();
      expect(session.visitorId).toBe('visitor-123');
      expect(session.status).toBe('active');
      // The tenant comes from the widget, never from a caller-supplied field
      // (REQ-09-014): createSession's contract has no tenantId parameter.
      expect(session.tenantId).toBe(tenantId);
    });

    it('refuses to create a session for a widget that does not exist', async () => {
      await expect(
        repo.createSession({
          widgetId: 'nonexistent-widget',
          visitorId: null,
          contactId: null,
          conversationId: null,
          ipAddress: null,
          userAgent: null,
          referrerUrl: null,
          landingPage: null,
          startedAt: new Date().toISOString(),
          status: 'active',
          metadata: {},
        }),
      ).rejects.toThrow('Widget not found');
    });

    it('should list sessions by widget', async () => {
      const widget = await repo.createWidget(tenantId, {
        name: 'Widget',
        domain: 'example.com',
        widgetType: 'chat',
        theme: {},
        position: 'bottom-right',
        language: 'id',
        greetingMessage: null,
        offlineMessage: null,
        businessHours: null,
        allowedOrigins: [],
        status: 'active',
        embedCode: null,
        analyticsEnabled: true,
      });

      await repo.createSession({
        widgetId: widget.id,
        visitorId: 'visitor-1',
        contactId: null,
        conversationId: null,
        ipAddress: null,
        userAgent: null,
        referrerUrl: null,
        landingPage: null,
        startedAt: new Date().toISOString(),
        status: 'active',
        metadata: {},
      });

      const sessions = await repo.listSessions(widget.id);
      expect(sessions).toHaveLength(1);
    });
  });
});
