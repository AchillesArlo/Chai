import { TenantId } from '../../common/tenant-id.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RetentionRepository } from './retention.repository';

const DELETION_METHOD = ['soft_delete', 'hard_delete', 'archive'] as const;
const RETENTION_JOB_STATUS = ['running', 'completed', 'failed'] as const;

class CreatePolicyDto {
  @IsBoolean()
  cascadeDelete!: boolean;

  @IsString()
  dataClass!: string;

  @IsIn(DELETION_METHOD)
  deletionMethod!: (typeof DELETION_METHOD)[number];

  /** Records exempted from the policy; caller-defined shape. */
  @IsArray()
  exceptions!: unknown[];

  @IsInt()
  @Min(0)
  retentionDays!: number;
}

class UpdatePolicyDto {
  @IsOptional()
  @IsBoolean()
  cascadeDelete?: boolean;

  @IsOptional()
  @IsString()
  dataClass?: string;

  @IsOptional()
  @IsIn(DELETION_METHOD)
  deletionMethod?: (typeof DELETION_METHOD)[number];

  @IsOptional()
  @IsArray()
  exceptions?: unknown[];

  @IsOptional()
  @IsInt()
  @Min(0)
  retentionDays?: number;
}

class CreateJobDto {
  @IsString()
  dataClass!: string;

  @IsOptional()
  @IsString()
  errorMessage!: string | null;

  @IsISO8601()
  startedAt!: string;

  @IsIn(RETENTION_JOB_STATUS)
  status!: (typeof RETENTION_JOB_STATUS)[number];

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
  @IsInt()
  @Min(0)
  recordsArchived?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  recordsDeleted?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  recordsProcessed?: number;

  @IsOptional()
  @IsIn(RETENTION_JOB_STATUS)
  status?: (typeof RETENTION_JOB_STATUS)[number];
}

@Controller('api/owner/v1/retention')
export class RetentionController {
  constructor(
    @Inject('RetentionRepository') private readonly repo: RetentionRepository,
  ) {}

  @Get('policies')
  @RequirePermission('platform.reliability.read')
  async listPolicies(@TenantId() tenantId: string) {
    return this.repo.listPolicies(tenantId);
  }

  @Get('policies/:id')
  @RequirePermission('platform.reliability.read')
  async getPolicy(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getPolicy(tenantId, id);
  }

  @Post('policies')
  @RequirePermission('platform.reliability.manage')
  async createPolicy(@TenantId() tenantId: string, @Body() body: CreatePolicyDto) {
    return this.repo.createPolicy(tenantId, body);
  }

  @Put('policies/:id')
  @RequirePermission('platform.reliability.manage')
  async updatePolicy(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdatePolicyDto) {
    return this.repo.updatePolicy(tenantId, id, body);
  }

  @Delete('policies/:id')
  @RequirePermission('platform.reliability.manage')
  async deletePolicy(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.deletePolicy(tenantId, id);
  }

  @Get('jobs')
  @RequirePermission('platform.reliability.read')
  async listJobs(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.repo.listJobs(tenantId, status);
  }

  @Get('jobs/:id')
  @RequirePermission('platform.reliability.read')
  async getJob(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getJob(tenantId, id);
  }

  @Post('jobs')
  @RequirePermission('platform.reliability.manage')
  async createJob(@Body() body: CreateJobDto) {
    return this.repo.createJob(body);
  }

  @Put('jobs/:id')
  @RequirePermission('platform.reliability.manage')
  async updateJob(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateJobDto,
  ) {
    return this.repo.updateJob(tenantId, id, body);
  }
}
