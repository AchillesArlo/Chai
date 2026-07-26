import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { JobQueueRepository } from './job-queue.repository';

const JOB_STATUS = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'delayed',
] as const;

const JOB_ATTEMPT_STATUS = ['success', 'failed', 'timeout'] as const;

class CreateQueueDto {
  @IsBoolean()
  active!: boolean;

  @IsInt()
  @Min(1)
  concurrency!: number;

  @IsOptional()
  @IsString()
  description!: string | null;

  @IsInt()
  @Min(0)
  maxRetries!: number;

  @IsString()
  queueName!: string;

  @IsInt()
  @Min(0)
  retryDelayMs!: number;

  @IsString()
  tenantId!: string;

  @IsInt()
  @Min(0)
  timeoutMs!: number;
}

class UpdateQueueDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrency?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetries?: number;

  @IsOptional()
  @IsString()
  queueName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryDelayMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeoutMs?: number;
}

class CreateJobDto {
  @IsString()
  jobType!: string;

  @IsInt()
  @Min(1)
  maxAttempts!: number;

  /** Opaque job payload handed to the worker; not interpreted here. */
  @IsObject()
  payload!: Record<string, unknown>;

  @IsInt()
  priority!: number;

  @IsString()
  queueId!: string;

  @IsISO8601()
  scheduledAt!: string;

  @IsIn(JOB_STATUS)
  status!: (typeof JOB_STATUS)[number];

  @IsString()
  tenantId!: string;
}

class UpdateJobDto {
  @IsOptional()
  @IsISO8601()
  completedAt?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsString()
  errorStack?: string;

  @IsOptional()
  @IsISO8601()
  failedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @IsOptional()
  @IsIn(JOB_STATUS)
  status?: (typeof JOB_STATUS)[number];
}

class CreateAttemptDto {
  @IsInt()
  @Min(1)
  attemptNumber!: number;

  @IsOptional()
  @IsISO8601()
  completedAt!: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs!: number | null;

  @IsOptional()
  @IsString()
  errorMessage!: string | null;

  @IsOptional()
  @IsString()
  errorStack!: string | null;

  @IsString()
  jobId!: string;

  @IsISO8601()
  startedAt!: string;

  @IsIn(JOB_ATTEMPT_STATUS)
  status!: (typeof JOB_ATTEMPT_STATUS)[number];
}

@Controller('internal/v1/job-queues')
@RequireAudience('service')
@RequirePermission('automation.execute')
export class JobQueueController {
  constructor(private readonly repo: JobQueueRepository) {}

  @Post()
  async createQueue(@Body() body: CreateQueueDto) {
    return this.repo.createQueue(body);
  }

  @Get(':id')
  async getQueue(@Param('id') id: string) {
    return this.repo.getQueue(id);
  }

  @Get()
  async listQueues(@TenantId() tenantId: string) {
    return this.repo.listQueues(tenantId);
  }

  @Post(':id')
  async updateQueue(@Param('id') id: string, @Body() body: UpdateQueueDto) {
    return this.repo.updateQueue(id, body);
  }
}

@Controller('jobs')
@RequireAudience('service')
@RequirePermission('automation.execute')
export class JobController {
  constructor(private readonly repo: JobQueueRepository) {}

  @Post()
  async createJob(@Body() body: CreateJobDto) {
    return this.repo.createJob(body);
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    return this.repo.getJob(id);
  }

  @Get('queue/:queueId')
  async listJobs(@Param('queueId') queueId: string, @Query('status') status?: string) {
    return this.repo.listJobs(queueId, status);
  }

  @Get('queue/:queueId/pending')
  async listPendingJobs(@Param('queueId') queueId: string, @Query('limit') limit?: string) {
    return this.repo.listPendingJobs(queueId, limit ? parseInt(limit) : 10);
  }

  @Post(':id')
  async updateJob(@Param('id') id: string, @Body() body: UpdateJobDto) {
    return this.repo.updateJob(id, body);
  }

  @Post(':id/increment-attempts')
  async incrementAttempts(@Param('id') id: string) {
    return this.repo.incrementAttempts(id);
  }

  @Get(':id/attempts')
  async listAttempts(@Param('id') id: string) {
    return this.repo.listAttempts(id);
  }
}

@Controller('job-attempts')
@RequireAudience('service')
@RequirePermission('automation.execute')
export class JobAttemptController {
  constructor(private readonly repo: JobQueueRepository) {}

  @Post()
  async createAttempt(@Body() body: CreateAttemptDto) {
    return this.repo.createAttempt(body);
  }
}
