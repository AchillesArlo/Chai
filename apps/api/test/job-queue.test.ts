import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryJobQueueRepository } from '../src/modules/job-queue/job-queue.repository';

describe('JobQueueRepository', () => {
  let repo: InMemoryJobQueueRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryJobQueueRepository();
  });

  describe('Job Queues', () => {
    it('should create job queue', async () => {
      const queue = await repo.createQueue({
        tenantId,
        queueName: 'email-queue',
        description: 'Email sending queue',
        concurrency: 5,
        maxRetries: 3,
        retryDelayMs: 5000,
        timeoutMs: 300000,
        active: true,
      });

      expect(queue.id).toBeDefined();
      expect(queue.queueName).toBe('email-queue');
      expect(queue.concurrency).toBe(5);
    });

    it('should list queues by tenant', async () => {
      await repo.createQueue({
        tenantId,
        queueName: 'queue-1',
        description: null,
        concurrency: 5,
        maxRetries: 3,
        retryDelayMs: 5000,
        timeoutMs: 300000,
        active: true,
      });

      const queues = await repo.listQueues(tenantId);
      expect(queues).toHaveLength(1);
    });
  });

  describe('Jobs', () => {
    it('should create job', async () => {
      const queue = await repo.createQueue({
        tenantId,
        queueName: 'test-queue',
        description: null,
        concurrency: 5,
        maxRetries: 3,
        retryDelayMs: 5000,
        timeoutMs: 300000,
        active: true,
      });

      const job = await repo.createJob({
        queueId: queue.id,
        tenantId,
        jobType: 'send-email',
        payload: { to: 'test@example.com', subject: 'Test' },
        priority: 0,
        status: 'pending',
        maxAttempts: 3,
        scheduledAt: new Date().toISOString(),
      });

      expect(job.id).toBeDefined();
      expect(job.jobType).toBe('send-email');
      expect(job.attempts).toBe(0);
    });

    it('should list pending jobs by priority', async () => {
      const queue = await repo.createQueue({
        tenantId,
        queueName: 'test-queue',
        description: null,
        concurrency: 5,
        maxRetries: 3,
        retryDelayMs: 5000,
        timeoutMs: 300000,
        active: true,
      });

      await repo.createJob({
        queueId: queue.id,
        tenantId,
        jobType: 'job-1',
        payload: {},
        priority: 0,
        status: 'pending',
        maxAttempts: 3,
        scheduledAt: new Date().toISOString(),
      });

      await repo.createJob({
        queueId: queue.id,
        tenantId,
        jobType: 'job-2',
        payload: {},
        priority: 10,
        status: 'pending',
        maxAttempts: 3,
        scheduledAt: new Date().toISOString(),
      });

      const pendingJobs = await repo.listPendingJobs(queue.id);
      expect(pendingJobs).toHaveLength(2);
      expect(pendingJobs[0]?.priority).toBe(10);
    });

    it('should increment job attempts', async () => {
      const queue = await repo.createQueue({
        tenantId,
        queueName: 'test-queue',
        description: null,
        concurrency: 5,
        maxRetries: 3,
        retryDelayMs: 5000,
        timeoutMs: 300000,
        active: true,
      });

      const job = await repo.createJob({
        queueId: queue.id,
        tenantId,
        jobType: 'test-job',
        payload: {},
        priority: 0,
        status: 'pending',
        maxAttempts: 3,
        scheduledAt: new Date().toISOString(),
      });

      const updated = await repo.incrementAttempts(job.id);
      expect(updated.attempts).toBe(1);
    });
  });

  describe('Job Attempts', () => {
    it('should create job attempt', async () => {
      const queue = await repo.createQueue({
        tenantId,
        queueName: 'test-queue',
        description: null,
        concurrency: 5,
        maxRetries: 3,
        retryDelayMs: 5000,
        timeoutMs: 300000,
        active: true,
      });

      const job = await repo.createJob({
        queueId: queue.id,
        tenantId,
        jobType: 'test-job',
        payload: {},
        priority: 0,
        status: 'processing',
        maxAttempts: 3,
        scheduledAt: new Date().toISOString(),
      });

      const attempt = await repo.createAttempt({
        jobId: job.id,
        attemptNumber: 1,
        startedAt: new Date().toISOString(),
        completedAt: null,
        durationMs: null,
        status: 'success',
        errorMessage: null,
        errorStack: null,
      });

      expect(attempt.id).toBeDefined();
      expect(attempt.attemptNumber).toBe(1);
    });

    it('should list attempts by job', async () => {
      const queue = await repo.createQueue({
        tenantId,
        queueName: 'test-queue',
        description: null,
        concurrency: 5,
        maxRetries: 3,
        retryDelayMs: 5000,
        timeoutMs: 300000,
        active: true,
      });

      const job = await repo.createJob({
        queueId: queue.id,
        tenantId,
        jobType: 'test-job',
        payload: {},
        priority: 0,
        status: 'failed',
        maxAttempts: 3,
        scheduledAt: new Date().toISOString(),
      });

      await repo.createAttempt({
        jobId: job.id,
        attemptNumber: 1,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1000,
        status: 'failed',
        errorMessage: 'Error 1',
        errorStack: null,
      });

      await repo.createAttempt({
        jobId: job.id,
        attemptNumber: 2,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 2000,
        status: 'success',
        errorMessage: null,
        errorStack: null,
      });

      const attempts = await repo.listAttempts(job.id);
      expect(attempts).toHaveLength(2);
    });
  });
});
