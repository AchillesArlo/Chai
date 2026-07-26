import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  type: 'BROADCAST' | 'SCHEDULED' | 'SEGMENTED';
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  channel: string;
  messageTemplateId: string | null;
  targetSegment: Record<string, unknown> | null; // free-form JSONB (schema-less)
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metrics: { sent: number; delivered: number; read: number; failed: number };
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMessage {
  id: string;
  campaignId: string;
  tenantId: string;
  contactId: string;
  messageId: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class CampaignRepository {
  abstract listCampaigns(tenantId: string): Promise<Campaign[]>;
  abstract getCampaign(tenantId: string, id: string): Promise<Campaign | null>;
  abstract createCampaign(tenantId: string, campaign: Omit<Campaign, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt' | 'metrics'>): Promise<Campaign>;
  abstract updateCampaign(tenantId: string, id: string, update: Partial<Campaign>): Promise<Campaign>;
  abstract listCampaignMessages(tenantId: string, campaignId: string): Promise<CampaignMessage[]>;
  abstract createCampaignMessage(tenantId: string, message: Omit<CampaignMessage, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt' | 'errorCode'>): Promise<CampaignMessage>;
  abstract updateCampaignMessage(tenantId: string, id: string, update: Partial<CampaignMessage>): Promise<CampaignMessage>;
}

@Injectable()
export class InMemoryCampaignRepository extends CampaignRepository {
  private campaigns = new Map<string, Campaign>();
  private messages = new Map<string, CampaignMessage>();

  async listCampaigns(tenantId: string): Promise<Campaign[]> {
    return Array.from(this.campaigns.values()).filter(c => c.tenantId === tenantId);
  }

  async getCampaign(tenantId: string, id: string): Promise<Campaign | null> {
    const c = this.campaigns.get(id);
    return c && c.tenantId === tenantId ? c : null;
  }

  async createCampaign(tenantId: string, campaign: Omit<Campaign, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt' | 'metrics'>): Promise<Campaign> {
    const now = new Date().toISOString();
    const created = { ...campaign, tenantId, id: randomUUID(), startedAt: null, completedAt: null, metrics: { sent: 0, delivered: 0, read: 0, failed: 0 }, createdAt: now, updatedAt: now };
    this.campaigns.set(created.id, created);
    return created;
  }

  async updateCampaign(tenantId: string, id: string, update: Partial<Campaign>): Promise<Campaign> {
    const existing = this.campaigns.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Campaign not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.campaigns.set(id, updated);
    return updated;
  }

  async listCampaignMessages(tenantId: string, campaignId: string): Promise<CampaignMessage[]> {
    return Array.from(this.messages.values()).filter(m => m.tenantId === tenantId && m.campaignId === campaignId);
  }

  async createCampaignMessage(tenantId: string, message: Omit<CampaignMessage, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt' | 'errorCode'>): Promise<CampaignMessage> {
    const now = new Date().toISOString();
    const created = { ...message, tenantId, id: randomUUID(), sentAt: null, deliveredAt: null, readAt: null, failedAt: null, errorCode: null, createdAt: now, updatedAt: now };
    this.messages.set(created.id, created);
    return created;
  }

  async updateCampaignMessage(tenantId: string, id: string, update: Partial<CampaignMessage>): Promise<CampaignMessage> {
    const existing = this.messages.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Campaign message not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.messages.set(id, updated);
    return updated;
  }
}
