import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { evaluateBurnRateAlerts, type BurnRateAlert } from '@chai/domain';

import { ObservabilityRepository } from './observability.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { ServiceLevelIndicator, ErrorBudget, Incident, Runbook, RunbookExecution } from './observability.repository';

class UpsertSliDto {
  @IsString()
  serviceName!: string;

  @IsString()
  indicatorName!: string;

  @IsNumber()
  targetValue!: number;

  @IsOptional()
  @IsNumber()
  currentValue?: number | null;

  @IsString()
  measurementWindow!: string;

  @IsIn(['healthy', 'warning', 'breached'])
  status!: 'healthy' | 'warning' | 'breached';
}

// burnRate is derived from consumption and never accepted from the caller (R-19);
// omitting it here lets forbidNonWhitelisted reject any attempt to assert one.
class CreateErrorBudgetDto {
  @IsString()
  serviceName!: string;

  @IsString()
  periodStart!: string;

  @IsString()
  periodEnd!: string;

  @IsNumber()
  totalBudgetSeconds!: number;

  @IsNumber()
  consumedSeconds!: number;
}

class UpdateErrorBudgetDto {
  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsString()
  periodStart?: string;

  @IsOptional()
  @IsString()
  periodEnd?: string;

  @IsOptional()
  @IsNumber()
  totalBudgetSeconds?: number;

  @IsOptional()
  @IsNumber()
  consumedSeconds?: number;
}

class BurnRateSampleDto {
  @IsNumber()
  badEvents!: number;

  @IsNumber()
  totalEvents!: number;

  @IsNumber()
  windowSeconds!: number;
}

class EvaluateBurnRateDto {
  @IsNumber()
  objective!: number;

  @IsNumber()
  periodDays!: number;

  @ValidateNested({ each: true })
  @Type(() => BurnRateSampleDto)
  samples!: BurnRateSampleDto[];

  @IsString()
  sloId!: string;
}

class CreateIncidentDto {
  @IsIn(['P1', 'P2', 'P3', 'P4'])
  severity!: 'P1' | 'P2' | 'P3' | 'P4';

  @IsIn(['investigating', 'identified', 'monitoring', 'resolved', 'postmortem'])
  status!: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'postmortem';

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  impact?: string | null;

  @IsOptional()
  @IsString()
  rootCause?: string | null;

  @IsOptional()
  @IsString()
  resolution?: string | null;

  @IsString()
  startedAt!: string;

  @IsOptional()
  @IsString()
  identifiedAt?: string | null;

  @IsOptional()
  @IsString()
  resolvedAt?: string | null;

  @IsString()
  createdBy!: string;
}

class UpdateIncidentDto {
  @IsOptional()
  @IsIn(['P1', 'P2', 'P3', 'P4'])
  severity?: 'P1' | 'P2' | 'P3' | 'P4';

  @IsOptional()
  @IsIn(['investigating', 'identified', 'monitoring', 'resolved', 'postmortem'])
  status?: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'postmortem';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  impact?: string | null;

  @IsOptional()
  @IsString()
  rootCause?: string | null;

  @IsOptional()
  @IsString()
  resolution?: string | null;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  identifiedAt?: string | null;

  @IsOptional()
  @IsString()
  resolvedAt?: string | null;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

class CreateRunbookDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsString()
  triggerCondition!: string;

  @IsArray()
  steps!: unknown[];

  @IsBoolean()
  autoExecute!: boolean;
}

class UpdateRunbookDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  triggerCondition?: string;

  @IsOptional()
  @IsArray()
  steps?: unknown[];

  @IsOptional()
  @IsBoolean()
  autoExecute?: boolean;
}

class CreateRunbookExecutionDto {
  @IsString()
  runbookId!: string;

  @IsIn(['running', 'success', 'failed', 'cancelled'])
  status!: 'running' | 'success' | 'failed' | 'cancelled';

  @IsString()
  startedAt!: string;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  @IsString()
  executedBy?: string | null;

  @IsOptional()
  @IsString()
  errorMessage?: string | null;
}

class UpdateRunbookExecutionDto {
  @IsOptional()
  @IsString()
  runbookId?: string;

  @IsOptional()
  @IsIn(['running', 'success', 'failed', 'cancelled'])
  status?: 'running' | 'success' | 'failed' | 'cancelled';

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  @IsString()
  executedBy?: string | null;

  @IsOptional()
  @IsString()
  errorMessage?: string | null;
}

@Controller('api/owner/v1/observability')
@UseGuards(TenantGuard)
export class ObservabilityController {
  constructor(
    @Inject(ObservabilityRepository)
    private readonly repo: ObservabilityRepository,
  ) {}

  // SLI endpoints
  @Get('sli')
  @RequirePermission('platform.reliability.read')
  async listSli(@TenantId() tenantId: string): Promise<ServiceLevelIndicator[]> {
    return this.repo.listSli(tenantId);
  }

  @Get('sli/:serviceName/:indicatorName')
  @RequirePermission('platform.reliability.read')
  async getSli(
    @TenantId() tenantId: string,
    @Param('serviceName') serviceName: string,
    @Param('indicatorName') indicatorName: string,
  ): Promise<ServiceLevelIndicator | null> {
    return this.repo.getSli(tenantId, serviceName, indicatorName);
  }

  @Post('sli')
  @RequirePermission('platform.reliability.manage')
  async upsertSli(
    @TenantId() tenantId: string,
    @Body() sli: UpsertSliDto,
  ): Promise<ServiceLevelIndicator> {
    return this.repo.upsertSli(tenantId, sli as Omit<ServiceLevelIndicator, 'id' | 'createdAt' | 'updatedAt'>);
  }

  // Error Budget endpoints
  @Get('error-budgets')
  @RequirePermission('platform.reliability.read')
  async listErrorBudgets(@TenantId() tenantId: string): Promise<ErrorBudget[]> {
    return this.repo.listErrorBudgets(tenantId);
  }

  @Post('error-budgets')
  @RequirePermission('platform.reliability.manage')
  async createErrorBudget(
    @TenantId() tenantId: string,
    @Body() budget: CreateErrorBudgetDto,
  ): Promise<ErrorBudget> {
    return this.repo.createErrorBudget(tenantId, budget as Omit<ErrorBudget, 'id' | 'createdAt' | 'updatedAt' | 'remainingSeconds'>);
  }

  @Put('error-budgets/:id')
  @RequirePermission('platform.reliability.manage')
  async updateErrorBudget(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateErrorBudgetDto,
  ): Promise<ErrorBudget> {
    return this.repo.updateErrorBudget(tenantId, id, update);
  }

  /**
   * Evaluates the multi-window burn-rate policy for one objective.
   *
   * Returns the alerts with their window, objective, and threshold attached, plus
   * the rules that could not be evaluated because a window was missing — an
   * absent window is not a healthy one (12 §5).
   */
  @Post('burn-rate')
  @RequirePermission('platform.reliability.read')
  async evaluateBurnRate(
    @Body() body: EvaluateBurnRateDto,
  ): Promise<{ alerts: BurnRateAlert[]; notEvaluated: string[] }> {
    return evaluateBurnRateAlerts(
      {
        objective: body.objective,
        periodDays: body.periodDays,
        sloId: body.sloId,
      },
      body.samples ?? [],
    );
  }

  // Incident endpoints
  @Get('incidents')
  @RequirePermission('platform.reliability.read')
  async listIncidents(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
  ): Promise<Incident[]> {
    return this.repo.listIncidents(tenantId, status);
  }

  @Get('incidents/:id')
  @RequirePermission('platform.reliability.read')
  async getIncident(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<Incident | null> {
    return this.repo.getIncident(tenantId, id);
  }

  @Post('incidents')
  @RequirePermission('platform.reliability.manage')
  async createIncident(
    @TenantId() tenantId: string,
    @Body() incident: CreateIncidentDto,
  ): Promise<Incident> {
    return this.repo.createIncident(tenantId, incident as Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'durationSeconds'>);
  }

  @Put('incidents/:id')
  @RequirePermission('platform.reliability.manage')
  async updateIncident(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateIncidentDto,
  ): Promise<Incident> {
    return this.repo.updateIncident(tenantId, id, update);
  }

  // Runbook endpoints
  @Get('runbooks')
  @RequirePermission('platform.reliability.read')
  async listRunbooks(@TenantId() tenantId: string): Promise<Runbook[]> {
    return this.repo.listRunbooks(tenantId);
  }

  @Get('runbooks/:id')
  @RequirePermission('platform.reliability.read')
  async getRunbook(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<Runbook | null> {
    return this.repo.getRunbook(tenantId, id);
  }

  @Post('runbooks')
  @RequirePermission('platform.reliability.manage')
  async createRunbook(
    @TenantId() tenantId: string,
    @Body() runbook: CreateRunbookDto,
  ): Promise<Runbook> {
    return this.repo.createRunbook(tenantId, runbook as Omit<Runbook, 'id' | 'createdAt' | 'updatedAt' | 'lastExecutedAt' | 'executionCount' | 'successCount'>);
  }

  @Put('runbooks/:id')
  @RequirePermission('platform.reliability.manage')
  async updateRunbook(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateRunbookDto,
  ): Promise<Runbook> {
    return this.repo.updateRunbook(tenantId, id, update);
  }

  // Runbook Execution endpoints
  @Get('runbook-executions')
  @RequirePermission('platform.reliability.read')
  async listRunbookExecutions(
    @TenantId() tenantId: string,
    @Query('runbookId') runbookId?: string,
  ): Promise<RunbookExecution[]> {
    return this.repo.listRunbookExecutions(tenantId, runbookId);
  }

  @Post('runbook-executions')
  @RequirePermission('platform.reliability.manage')
  async createRunbookExecution(
    @TenantId() tenantId: string,
    @Body() execution: CreateRunbookExecutionDto,
  ): Promise<RunbookExecution> {
    return this.repo.createRunbookExecution(tenantId, execution as Omit<RunbookExecution, 'id' | 'createdAt' | 'durationSeconds'>);
  }

  @Put('runbook-executions/:id')
  @RequirePermission('platform.reliability.manage')
  async updateRunbookExecution(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateRunbookExecutionDto,
  ): Promise<RunbookExecution> {
    return this.repo.updateRunbookExecution(tenantId, id, update);
  }
}
