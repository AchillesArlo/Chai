import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface RetentionPolicy {
  id: string;
  tenantId: string;
  dataClass: string;
  retentionDays: number;
  deletionMethod: 'soft_delete' | 'hard_delete' | 'archive';
  cascadeDelete: boolean;
  exceptions: unknown[]; // free-form JSONB (schema-less)
  createdAt: string;
  updatedAt: string;
}

export interface RetentionJob {
  id: string;
  tenantId: string;
  dataClass: string;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number;
  recordsDeleted: number;
  recordsArchived: number;
  status: 'running' | 'completed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
}

export abstract class RetentionRepository {
  abstract listPolicies(tenantId: string): Promise<RetentionPolicy[]>;
  abstract getPolicy(tenantId: string, id: string): Promise<RetentionPolicy | null>;
  abstract createPolicy(tenantId: string, policy: Omit<RetentionPolicy, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<RetentionPolicy>;
  abstract updatePolicy(tenantId: string, id: string, update: Partial<RetentionPolicy>): Promise<RetentionPolicy>;
  abstract deletePolicy(tenantId: string, id: string): Promise<void>;

  abstract listJobs(tenantId: string, status?: string): Promise<RetentionJob[]>;
  abstract getJob(id: string): Promise<RetentionJob | null>;
  abstract createJob(job: Omit<RetentionJob, 'id' | 'createdAt' | 'completedAt' | 'recordsProcessed' | 'recordsDeleted' | 'recordsArchived'>): Promise<RetentionJob>;
  abstract updateJob(id: string, update: Partial<RetentionJob>): Promise<RetentionJob>;
}

@Injectable()
export class InMemoryRetentionRepository extends RetentionRepository {
  private policies = new Map<string, RetentionPolicy>();
  private jobs = new Map<string, RetentionJob>();

  async listPolicies(tenantId: string): Promise<RetentionPolicy[]> {
    return Array.from(this.policies.values()).filter(p => p.tenantId === tenantId);
  }

  async getPolicy(tenantId: string, id: string): Promise<RetentionPolicy | null> {
    const p = this.policies.get(id);
    return p && p.tenantId === tenantId ? p : null;
  }

  async createPolicy(tenantId: string, policy: Omit<RetentionPolicy, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<RetentionPolicy> {
    const now = new Date().toISOString();
    const created = { ...policy, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.policies.set(created.id, created);
    return created;
  }

  async updatePolicy(tenantId: string, id: string, update: Partial<RetentionPolicy>): Promise<RetentionPolicy> {
    const existing = this.policies.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Retention policy not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.policies.set(id, updated);
    return updated;
  }

  async deletePolicy(tenantId: string, id: string): Promise<void> {
    const existing = this.policies.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Retention policy not found');
    this.policies.delete(id);
  }

  async listJobs(tenantId: string, status?: string): Promise<RetentionJob[]> {
    return Array.from(this.jobs.values()).filter(
      j => j.tenantId === tenantId && (!status || j.status === status)
    );
  }

  async getJob(id: string): Promise<RetentionJob | null> {
    return this.jobs.get(id) || null;
  }

  async createJob(job: Omit<RetentionJob, 'id' | 'createdAt' | 'completedAt' | 'recordsProcessed' | 'recordsDeleted' | 'recordsArchived'>): Promise<RetentionJob> {
    const created = { ...job, id: randomUUID(), createdAt: new Date().toISOString(), completedAt: null, recordsProcessed: 0, recordsDeleted: 0, recordsArchived: 0 };
    this.jobs.set(created.id, created);
    return created;
  }

  async updateJob(id: string, update: Partial<RetentionJob>): Promise<RetentionJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error('Retention job not found');
    const updated = { ...existing, ...update };
    this.jobs.set(id, updated);
    return updated;
  }
}
