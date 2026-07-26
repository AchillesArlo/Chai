import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Job {
  id: string;
  queueId: string;
  tenantId: string;
  jobType: string;
  payload: Record<string, unknown>;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'delayed';
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  errorStack: string | null;
  result: Record<string, unknown> | null; // free-form JSONB (schema-less)
  createdAt: string;
  updatedAt: string;
}

export interface JobQueue {
  id: string;
  tenantId: string;
  queueName: string;
  description: string | null;
  concurrency: number;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobAttempt {
  id: string;
  jobId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: 'success' | 'failed' | 'timeout';
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: string;
}

export abstract class JobQueueRepository {
  abstract createQueue(queue: Omit<JobQueue, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobQueue>;
  abstract getQueue(id: string): Promise<JobQueue | null>;
  abstract listQueues(tenantId: string): Promise<JobQueue[]>;
  abstract updateQueue(id: string, update: Partial<JobQueue>): Promise<JobQueue>;

  abstract createJob(job: Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'startedAt' | 'completedAt' | 'failedAt' | 'errorMessage' | 'errorStack' | 'result'>): Promise<Job>;
  abstract getJob(id: string): Promise<Job | null>;
  abstract listJobs(queueId: string, status?: string): Promise<Job[]>;
  abstract listPendingJobs(queueId: string, limit?: number): Promise<Job[]>;
  abstract updateJob(id: string, update: Partial<Job>): Promise<Job>;
  abstract incrementAttempts(id: string): Promise<Job>;

  abstract createAttempt(attempt: Omit<JobAttempt, 'id' | 'createdAt'>): Promise<JobAttempt>;
  abstract listAttempts(jobId: string): Promise<JobAttempt[]>;
}

@Injectable()
export class InMemoryJobQueueRepository extends JobQueueRepository {
  private queues = new Map<string, JobQueue>();
  private jobs = new Map<string, Job>();
  private attempts: JobAttempt[] = [];

  async createQueue(queue: Omit<JobQueue, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobQueue> {
    const now = new Date().toISOString();
    const newQueue: JobQueue = {
      ...queue,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.queues.set(newQueue.id, newQueue);
    return newQueue;
  }

  async getQueue(id: string): Promise<JobQueue | null> {
    return this.queues.get(id) || null;
  }

  async listQueues(tenantId: string): Promise<JobQueue[]> {
    return Array.from(this.queues.values()).filter(q => q.tenantId === tenantId);
  }

  async updateQueue(id: string, update: Partial<JobQueue>): Promise<JobQueue> {
    const queue = this.queues.get(id);
    if (!queue) throw new Error('Queue not found');
    const updated = { ...queue, ...update, updatedAt: new Date().toISOString() };
    this.queues.set(id, updated);
    return updated;
  }

  async createJob(job: Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'startedAt' | 'completedAt' | 'failedAt' | 'errorMessage' | 'errorStack' | 'result'>): Promise<Job> {
    const now = new Date().toISOString();
    const newJob: Job = {
      ...job,
      id: randomUUID(),
      attempts: 0,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorMessage: null,
      errorStack: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(newJob.id, newJob);
    return newJob;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async listJobs(queueId: string, status?: string): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter(j => {
      if (j.queueId !== queueId) return false;
      if (status && j.status !== status) return false;
      return true;
    });
  }

  async listPendingJobs(queueId: string, limit = 10): Promise<Job[]> {
    return Array.from(this.jobs.values())
      .filter(j => j.queueId === queueId && j.status === 'pending' && new Date(j.scheduledAt) <= new Date())
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  async updateJob(id: string, update: Partial<Job>): Promise<Job> {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Job not found');
    const updated = { ...job, ...update, updatedAt: new Date().toISOString() };
    this.jobs.set(id, updated);
    return updated;
  }

  async incrementAttempts(id: string): Promise<Job> {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Job not found');
    const updated = { ...job, attempts: job.attempts + 1, updatedAt: new Date().toISOString() };
    this.jobs.set(id, updated);
    return updated;
  }

  async createAttempt(attempt: Omit<JobAttempt, 'id' | 'createdAt'>): Promise<JobAttempt> {
    const newAttempt: JobAttempt = {
      ...attempt,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.attempts.push(newAttempt);
    return newAttempt;
  }

  async listAttempts(jobId: string): Promise<JobAttempt[]> {
    return this.attempts.filter(a => a.jobId === jobId);
  }
}
