import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryOutboxRepository } from '../src/modules/outbox/outbox.repository';

describe('OutboxRepository', () => {
  let repo: InMemoryOutboxRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryOutboxRepository();
  });

  describe('Outbox Events', () => {
    it('should create outbox event', async () => {
      const event = await repo.createEvent(tenantId, {
        eventType: 'conversation.created',
        aggregateType: 'conversation',
        aggregateId: 'conv-123',
        aggregateVersion: 1,
        payload: { subject: 'Test' },
        metadata: {},
        correlationId: null,
        causationId: null,
        status: 'pending',
        retryCount: 0,
        maxRetries: 5,
        publishedAt: null,
        failedAt: null,
        errorMessage: null,
      });

      expect(event.id).toBeDefined();
      expect(event.eventType).toBe('conversation.created');
      expect(event.status).toBe('pending');
    });

    it('should list events by tenant', async () => {
      await repo.createEvent(tenantId, {
        eventType: 'test.event',
        aggregateType: 'test',
        aggregateId: 'test-1',
        aggregateVersion: 1,
        payload: {},
        metadata: {},
        correlationId: null,
        causationId: null,
        status: 'pending',
        retryCount: 0,
        maxRetries: 5,
        publishedAt: null,
        failedAt: null,
        errorMessage: null,
      });

      const events = await repo.listEvents(tenantId);
      expect(events).toHaveLength(1);
    });

    it('should update event status', async () => {
      const event = await repo.createEvent(tenantId, {
        eventType: 'test.event',
        aggregateType: 'test',
        aggregateId: 'test-1',
        aggregateVersion: 1,
        payload: {},
        metadata: {},
        correlationId: null,
        causationId: null,
        status: 'pending',
        retryCount: 0,
        maxRetries: 5,
        publishedAt: null,
        failedAt: null,
        errorMessage: null,
      });

      const updated = await repo.updateEvent(tenantId, event.id, {
        status: 'published',
        publishedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('published');
      expect(updated.publishedAt).toBeDefined();
    });
  });

  describe('Event Subscriptions', () => {
    it('should create subscription', async () => {
      const subscription = await repo.createSubscription(tenantId, {
        name: 'Test Subscription',
        eventTypes: ['conversation.created'],
        endpointUrl: 'https://example.com/webhook',
        secretKey: 'secret-123',
        active: true,
        retryPolicy: { maxRetries: 3 },
        lastDeliveredAt: null,
        lastError: null,
      });

      expect(subscription.id).toBeDefined();
      expect(subscription.name).toBe('Test Subscription');
      expect(subscription.active).toBe(true);
    });

    it('should list subscriptions by tenant', async () => {
      await repo.createSubscription(tenantId, {
        name: 'Test Subscription',
        eventTypes: ['test.event'],
        endpointUrl: 'https://example.com/webhook',
        secretKey: 'secret-123',
        active: true,
        retryPolicy: {},
        lastDeliveredAt: null,
        lastError: null,
      });

      const subscriptions = await repo.listSubscriptions(tenantId);
      expect(subscriptions).toHaveLength(1);
    });
  });
});
