import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCampaignRepository } from '../src/modules/campaign/campaign.repository';

describe('CampaignRepository', () => {
  let repo: InMemoryCampaignRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryCampaignRepository();
  });

  describe('Campaigns', () => {
    it('should create campaign', async () => {
      const campaign = await repo.createCampaign(tenantId, {
        name: 'Summer Promo',
        type: 'BROADCAST',
        channel: 'whatsapp',
        status: 'DRAFT',
        messageTemplateId: 'template-123',
        targetSegment: null,
        scheduledAt: null,
      });

      expect(campaign.id).toBeDefined();
      expect(campaign.name).toBe('Summer Promo');
      expect(campaign.type).toBe('BROADCAST');
      expect(campaign.status).toBe('DRAFT');
    });

    it('should list campaigns by tenant', async () => {
      await repo.createCampaign(tenantId, {
        name: 'Campaign 1',
        type: 'BROADCAST',
        channel: 'whatsapp',
        status: 'ACTIVE',
        messageTemplateId: 'template-1',
        targetSegment: null,
        scheduledAt: null,
      });

      await repo.createCampaign(tenantId, {
        name: 'Campaign 2',
        type: 'SCHEDULED',
        channel: 'email',
        status: 'DRAFT',
        messageTemplateId: 'template-2',
        targetSegment: null,
        scheduledAt: new Date().toISOString(),
      });

      const campaigns = await repo.listCampaigns(tenantId);
      expect(campaigns).toHaveLength(2);
    });

    it('should update campaign', async () => {
      const campaign = await repo.createCampaign(tenantId, {
        name: 'Test Campaign',
        type: 'BROADCAST',
        channel: 'whatsapp',
        status: 'DRAFT',
        messageTemplateId: 'template-1',
        targetSegment: null,
        scheduledAt: null,
      });

      const updated = await repo.updateCampaign(tenantId, campaign.id, {
        status: 'ACTIVE',
      });

      expect(updated.status).toBe('ACTIVE');
    });

    it('should get campaign by id', async () => {
      const campaign = await repo.createCampaign(tenantId, {
        name: 'Get Test',
        type: 'BROADCAST',
        channel: 'whatsapp',
        status: 'DRAFT',
        messageTemplateId: 'template-1',
        targetSegment: null,
        scheduledAt: null,
      });

      const found = await repo.getCampaign(tenantId, campaign.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('Get Test');
    });
  });

  describe('Campaign Messages', () => {
    it('should create campaign message', async () => {
      const campaign = await repo.createCampaign(tenantId, {
        name: 'Test Campaign',
        type: 'BROADCAST',
        channel: 'whatsapp',
        status: 'ACTIVE',
        messageTemplateId: 'template-1',
        targetSegment: null,
        scheduledAt: null,
      });

      const message = await repo.createCampaignMessage(tenantId, {
        campaignId: campaign.id,
        contactId: 'contact-123',
        messageId: null,
        status: 'PENDING',
      });

      expect(message.id).toBeDefined();
      expect(message.campaignId).toBe(campaign.id);
      expect(message.status).toBe('PENDING');
    });

    it('should list campaign messages', async () => {
      const campaign = await repo.createCampaign(tenantId, {
        name: 'Test Campaign',
        type: 'BROADCAST',
        channel: 'whatsapp',
        status: 'ACTIVE',
        messageTemplateId: 'template-1',
        targetSegment: null,
        scheduledAt: null,
      });

      await repo.createCampaignMessage(tenantId, {
        campaignId: campaign.id,
        contactId: 'contact-1',
        messageId: null,
        status: 'SENT',
      });

      await repo.createCampaignMessage(tenantId, {
        campaignId: campaign.id,
        contactId: 'contact-2',
        messageId: null,
        status: 'DELIVERED',
      });

      const messages = await repo.listCampaignMessages(tenantId, campaign.id);
      expect(messages).toHaveLength(2);
    });

    it('should update campaign message', async () => {
      const campaign = await repo.createCampaign(tenantId, {
        name: 'Test Campaign',
        type: 'BROADCAST',
        channel: 'whatsapp',
        status: 'ACTIVE',
        messageTemplateId: 'template-1',
        targetSegment: null,
        scheduledAt: null,
      });

      const message = await repo.createCampaignMessage(tenantId, {
        campaignId: campaign.id,
        contactId: 'contact-1',
        messageId: null,
        status: 'PENDING',
      });

      const updated = await repo.updateCampaignMessage(tenantId, message.id, {
        status: 'SENT',
        sentAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('SENT');
      expect(updated.sentAt).toBeDefined();
    });
  });
});
