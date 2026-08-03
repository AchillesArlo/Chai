import { describe, expect, it } from 'vitest';

import {
  InMemoryMarketplaceRepository,
} from '../../src/modules/marketplace/marketplace.repository';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-000000000001';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-000000000002';

describe('InMemoryMarketplaceRepository (S4-4)', () => {
  // ── Webhook Subscriptions ──────────────────────────────────────────────────

  describe('webhooks', () => {
    it('creates a webhook with signing secret and ACTIVE status', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const webhook = await repo.createWebhook(TENANT_A, {
        url: 'https://example.com/hook',
        description: 'Test webhook',
        events: ['order.created', 'payment.completed'],
      });

      expect(webhook.id).toBeTruthy();
      expect(webhook.tenantId).toBe(TENANT_A);
      expect(webhook.url).toBe('https://example.com/hook');
      expect(webhook.description).toBe('Test webhook');
      expect(webhook.events).toEqual(['order.created', 'payment.completed']);
      expect(webhook.signingSecretPlaintext).toMatch(/^whsec_/);
      expect(webhook.status).toBe('ACTIVE');
    });

    it('lists webhooks scoped to tenant', async () => {
      const repo = new InMemoryMarketplaceRepository();
      await repo.createWebhook(TENANT_A, { url: 'https://a.example.com/hook' });
      await repo.createWebhook(TENANT_B, { url: 'https://b.example.com/hook' });

      const aWebhooks = await repo.listWebhooks(TENANT_A);
      expect(aWebhooks).toHaveLength(1);
      expect(aWebhooks[0]?.url).toBe('https://a.example.com/hook');

      const bWebhooks = await repo.listWebhooks(TENANT_B);
      expect(bWebhooks).toHaveLength(1);
      expect(bWebhooks[0]?.url).toBe('https://b.example.com/hook');
    });

    it('updates webhook URL and events', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const webhook = await repo.createWebhook(TENANT_A, { url: 'https://old.example.com/hook' });

      const updated = await repo.updateWebhook(TENANT_A, webhook.id, {
        url: 'https://new.example.com/hook',
        events: ['order.updated'],
        status: 'PAUSED',
      });

      expect(updated.url).toBe('https://new.example.com/hook');
      expect(updated.events).toEqual(['order.updated']);
      expect(updated.status).toBe('PAUSED');
    });

    it('deletes a webhook', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const webhook = await repo.createWebhook(TENANT_A, { url: 'https://example.com/hook' });

      await repo.deleteWebhook(TENANT_A, webhook.id);

      const fetched = await repo.getWebhook(TENANT_A, webhook.id);
      expect(fetched).toBeNull();
    });

    it('returns null for webhook not found', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const result = await repo.getWebhook(TENANT_A, 'nonexistent-id');
      expect(result).toBeNull();
    });

    it('throws on update of nonexistent webhook', async () => {
      const repo = new InMemoryMarketplaceRepository();
      await expect(
        repo.updateWebhook(TENANT_A, 'nonexistent-id', { url: 'https://new.com' }),
      ).rejects.toThrow('webhook not found');
    });
  });

  // ── Marketplace Listings ───────────────────────────────────────────────────

  describe('listings', () => {
    it('creates a listing with defaults', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const listing = await repo.createListing({
        providerId: 'midtrans',
        name: 'Midtrans',
        description: 'Payment gateway for Indonesia',
      });

      expect(listing.id).toBeTruthy();
      expect(listing.providerId).toBe('midtrans');
      expect(listing.category).toBe('connector');
      expect(listing.version).toBe('1.0.0');
      expect(listing.published).toBe(false);
    });

    it('only lists published listings', async () => {
      const repo = new InMemoryMarketplaceRepository();
      await repo.createListing({ providerId: 'a', name: 'A', description: 'A connector' });
      const b = await repo.createListing({ providerId: 'b', name: 'B', description: 'B connector' });
      await repo.updateListing(b.id, { published: true });

      const listings = await repo.listListings();
      expect(listings).toHaveLength(1);
      expect(listings[0]?.providerId).toBe('b');
    });

    it('filters listings by category', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const a = await repo.createListing({
        providerId: 'a',
        name: 'A',
        description: 'A connector',
        category: 'connector',
      });
      const b = await repo.createListing({
        providerId: 'b',
        name: 'B',
        description: 'B automation',
        category: 'automation',
      });
      await repo.updateListing(a.id, { published: true });
      await repo.updateListing(b.id, { published: true });

      const connectors = await repo.listListings('connector');
      expect(connectors).toHaveLength(1);
      expect(connectors[0]?.providerId).toBe('a');

      const automations = await repo.listListings('automation');
      expect(automations).toHaveLength(1);
      expect(automations[0]?.providerId).toBe('b');
    });

    it('looks up listing by provider ID', async () => {
      const repo = new InMemoryMarketplaceRepository();
      await repo.createListing({ providerId: 'whatsapp-cloud', name: 'WhatsApp Cloud', description: 'Meta WA API' });

      const found = await repo.getListingByProvider('whatsapp-cloud');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('WhatsApp Cloud');

      const notFound = await repo.getListingByProvider('nonexistent');
      expect(notFound).toBeNull();
    });
  });

  // ── Installations ──────────────────────────────────────────────────────────

  describe('installations', () => {
    it('installs a listing for a tenant', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const listing = await repo.createListing({ providerId: 'midtrans', name: 'Midtrans', description: 'Payments' });

      const installation = await repo.installListing(TENANT_A, listing.id, { apiKey: 'test-key' });

      expect(installation.id).toBeTruthy();
      expect(installation.tenantId).toBe(TENANT_A);
      expect(installation.listingId).toBe(listing.id);
      expect(installation.config).toEqual({ apiKey: 'test-key' });
      expect(installation.status).toBe('ACTIVE');
    });

    it('lists installations scoped to tenant', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const l1 = await repo.createListing({ providerId: 'a', name: 'A', description: 'A' });
      const l2 = await repo.createListing({ providerId: 'b', name: 'B', description: 'B' });

      await repo.installListing(TENANT_A, l1.id);
      await repo.installListing(TENANT_B, l2.id);

      const aInstalls = await repo.listInstallations(TENANT_A);
      expect(aInstalls).toHaveLength(1);
      expect(aInstalls[0]?.listingId).toBe(l1.id);
    });

    it('updates installation config', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const listing = await repo.createListing({ providerId: 'midtrans', name: 'Midtrans', description: 'Payments' });
      await repo.installListing(TENANT_A, listing.id, { apiKey: 'old' });

      const updated = await repo.updateInstallation(TENANT_A, listing.id, {
        config: { apiKey: 'new' },
        status: 'SUSPENDED',
      });

      expect(updated.config).toEqual({ apiKey: 'new' });
      expect(updated.status).toBe('SUSPENDED');
    });

    it('uninstalls a listing', async () => {
      const repo = new InMemoryMarketplaceRepository();
      const listing = await repo.createListing({ providerId: 'midtrans', name: 'Midtrans', description: 'Payments' });
      await repo.installListing(TENANT_A, listing.id);

      await repo.uninstallInstallation(TENANT_A, listing.id);

      const found = await repo.getInstallation(TENANT_A, listing.id);
      expect(found).toBeNull();
    });
  });
});
