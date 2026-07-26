import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface ContactSegment {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  filterRules: Record<string, unknown>; // free-form JSONB (schema-less)
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export abstract class ContactSegmentRepository {
  abstract listSegments(tenantId: string): Promise<ContactSegment[]>;
  abstract getSegment(tenantId: string, id: string): Promise<ContactSegment | null>;
  abstract createSegment(tenantId: string, segment: Omit<ContactSegment, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>): Promise<ContactSegment>;
  abstract updateSegment(tenantId: string, id: string, update: Partial<ContactSegment>): Promise<ContactSegment>;
  abstract deleteSegment(tenantId: string, id: string): Promise<void>;
}

@Injectable()
export class InMemoryContactSegmentRepository extends ContactSegmentRepository {
  private segments = new Map<string, ContactSegment>();

  async listSegments(tenantId: string): Promise<ContactSegment[]> {
    return Array.from(this.segments.values()).filter(s => s.tenantId === tenantId);
  }

  async getSegment(tenantId: string, id: string): Promise<ContactSegment | null> {
    const s = this.segments.get(id);
    return s && s.tenantId === tenantId ? s : null;
  }

  async createSegment(tenantId: string, segment: Omit<ContactSegment, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>): Promise<ContactSegment> {
    const now = new Date().toISOString();
    const created = { ...segment, tenantId, id: randomUUID(), memberCount: 0, createdAt: now, updatedAt: now };
    this.segments.set(created.id, created);
    return created;
  }

  async updateSegment(tenantId: string, id: string, update: Partial<ContactSegment>): Promise<ContactSegment> {
    const existing = this.segments.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Segment not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.segments.set(id, updated);
    return updated;
  }

  async deleteSegment(tenantId: string, id: string): Promise<void> {
    const existing = this.segments.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Segment not found');
    this.segments.delete(id);
  }
}
