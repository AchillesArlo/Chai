import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { evaluateBurnRateAlerts, type BurnRateAlert, type BurnRateSample } from '@chai/domain';

import { ObservabilityRepository } from './observability.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { ServiceLevelIndicator, ErrorBudget, Incident, Runbook, RunbookExecution } from './observability.repository';

@Controller('api/owner/v1/observability')
@UseGuards(TenantGuard)
export class ObservabilityController {
  constructor(private readonly repo: ObservabilityRepository) {}

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
    @Body() sli: Omit<ServiceLevelIndicator, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ServiceLevelIndicator> {
    return this.repo.upsertSli(tenantId, sli);
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
    @Body() budget: Omit<ErrorBudget, 'id' | 'createdAt' | 'updatedAt' | 'remainingSeconds'>,
  ): Promise<ErrorBudget> {
    return this.repo.createErrorBudget(tenantId, budget);
  }

  @Put('error-budgets/:id')
  @RequirePermission('platform.reliability.manage')
  async updateErrorBudget(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<ErrorBudget>,
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
    @Body()
    body: {
      objective: number;
      periodDays: number;
      samples: BurnRateSample[];
      sloId: string;
    },
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
    @Body() incident: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'durationSeconds'>,
  ): Promise<Incident> {
    return this.repo.createIncident(tenantId, incident);
  }

  @Put('incidents/:id')
  @RequirePermission('platform.reliability.manage')
  async updateIncident(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<Incident>,
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
    @Body() runbook: Omit<Runbook, 'id' | 'createdAt' | 'updatedAt' | 'lastExecutedAt' | 'executionCount' | 'successCount'>,
  ): Promise<Runbook> {
    return this.repo.createRunbook(tenantId, runbook);
  }

  @Put('runbooks/:id')
  @RequirePermission('platform.reliability.manage')
  async updateRunbook(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<Runbook>,
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
    @Body() execution: Omit<RunbookExecution, 'id' | 'createdAt' | 'durationSeconds'>,
  ): Promise<RunbookExecution> {
    return this.repo.createRunbookExecution(tenantId, execution);
  }

  @Put('runbook-executions/:id')
  @RequirePermission('platform.reliability.manage')
  async updateRunbookExecution(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<RunbookExecution>,
  ): Promise<RunbookExecution> {
    return this.repo.updateRunbookExecution(tenantId, id, update);
  }
}
