import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface MessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  body: string;
  variables: string[];
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class TemplateRepository {
  abstract listTemplates(tenantId: string, category?: string): Promise<MessageTemplate[]>;
  abstract getTemplate(tenantId: string, id: string): Promise<MessageTemplate | null>;
  abstract createTemplate(tenantId: string, template: Omit<MessageTemplate, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<MessageTemplate>;
  abstract updateTemplate(tenantId: string, id: string, update: Partial<MessageTemplate>): Promise<MessageTemplate>;
  abstract deleteTemplate(tenantId: string, id: string): Promise<void>;
}

@Injectable()
export class InMemoryTemplateRepository extends TemplateRepository {
  private templates = new Map<string, MessageTemplate>();

  async listTemplates(tenantId: string, category?: string): Promise<MessageTemplate[]> {
    return Array.from(this.templates.values()).filter(t => t.tenantId === tenantId && (!category || t.category === category));
  }

  async getTemplate(tenantId: string, id: string): Promise<MessageTemplate | null> {
    const t = this.templates.get(id);
    return t && t.tenantId === tenantId ? t : null;
  }

  async createTemplate(tenantId: string, template: Omit<MessageTemplate, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<MessageTemplate> {
    const now = new Date().toISOString();
    const created = { ...template, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.templates.set(created.id, created);
    return created;
  }

  async updateTemplate(tenantId: string, id: string, update: Partial<MessageTemplate>): Promise<MessageTemplate> {
    const existing = this.templates.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Template not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.templates.set(id, updated);
    return updated;
  }

  async deleteTemplate(tenantId: string, id: string): Promise<void> {
    const existing = this.templates.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Template not found');
    this.templates.delete(id);
  }
}
