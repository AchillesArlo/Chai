import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { AdvancedAnalyticsRepository } from './advanced-analytics.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { AnalyticsDashboard, AnalyticsReport, ReportExecution, PredictiveModel, PredictionResult, CohortDefinition } from './advanced-analytics.repository';

class CreateDashboardDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsArray()
  layout!: unknown[];

  @IsBoolean()
  isDefault!: boolean;
}

class UpdateDashboardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  layout?: unknown[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

class CreateReportDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsObject()
  queryConfig!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  scheduleCron?: string | null;
}

class UpdateReportDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  queryConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  scheduleCron?: string | null;
}

class CreateReportExecutionDto {
  @IsString()
  reportId!: string;

  @IsIn(['running', 'completed', 'failed'])
  status!: 'running' | 'completed' | 'failed';

  @IsOptional()
  @IsObject()
  resultSummary?: Record<string, unknown> | null;

  @IsString()
  startedAt!: string;

  @IsOptional()
  @IsString()
  completedAt?: string | null;
}

class UpdateReportExecutionDto {
  @IsOptional()
  @IsString()
  reportId?: string;

  @IsOptional()
  @IsIn(['running', 'completed', 'failed'])
  status?: 'running' | 'completed' | 'failed';

  @IsOptional()
  @IsObject()
  resultSummary?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  completedAt?: string | null;
}

class CreateModelDto {
  @IsIn(['churn_prediction', 'revenue_forecast', 'engagement_score'])
  modelType!: 'churn_prediction' | 'revenue_forecast' | 'engagement_score';

  @IsString()
  name!: string;

  @IsString()
  version!: string;

  @IsOptional()
  @IsNumber()
  accuracy?: number | null;

  @IsOptional()
  @IsString()
  trainedAt?: string | null;

  @IsObject()
  modelConfig!: Record<string, unknown>;

  @IsBoolean()
  isActive!: boolean;
}

class UpdateModelDto {
  @IsOptional()
  @IsIn(['churn_prediction', 'revenue_forecast', 'engagement_score'])
  modelType?: 'churn_prediction' | 'revenue_forecast' | 'engagement_score';

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsNumber()
  accuracy?: number | null;

  @IsOptional()
  @IsString()
  trainedAt?: string | null;

  @IsOptional()
  @IsObject()
  modelConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class CreatePredictionDto {
  @IsString()
  modelId!: string;

  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsObject()
  predictionValue!: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  confidence?: number | null;
}

class CreateCohortDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsObject()
  criteria!: Record<string, unknown>;
}

class UpdateCohortDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  criteria?: Record<string, unknown>;
}

@Controller('api/client/v1/advanced-analytics')
@UseGuards(TenantGuard)
export class AdvancedAnalyticsController {
  constructor(
    @Inject(AdvancedAnalyticsRepository)
    private readonly repo: AdvancedAnalyticsRepository,
  ) {}

  // Dashboard endpoints
  @Get('dashboards')
  @RequirePermission('analytics.read')
  async listDashboards(@TenantId() tenantId: string): Promise<AnalyticsDashboard[]> {
    return this.repo.listDashboards(tenantId);
  }

  @Get('dashboards/:id')
  @RequirePermission('analytics.read')
  async getDashboard(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<AnalyticsDashboard | null> {
    return this.repo.getDashboard(tenantId, id);
  }

  @Post('dashboards')
  @RequirePermission('analytics.export')
  async createDashboard(
    @TenantId() tenantId: string,
    @Body() dashboard: CreateDashboardDto,
  ): Promise<AnalyticsDashboard> {
    return this.repo.createDashboard(tenantId, dashboard as Omit<AnalyticsDashboard, 'id' | 'createdAt' | 'updatedAt'>);
  }

  @Put('dashboards/:id')
  @RequirePermission('analytics.export')
  async updateDashboard(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateDashboardDto,
  ): Promise<AnalyticsDashboard> {
    return this.repo.updateDashboard(tenantId, id, update);
  }

  @Delete('dashboards/:id')
  @RequirePermission('analytics.export')
  async deleteDashboard(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repo.deleteDashboard(tenantId, id);
  }

  // Report endpoints
  @Get('reports')
  @RequirePermission('analytics.read')
  async listReports(@TenantId() tenantId: string): Promise<AnalyticsReport[]> {
    return this.repo.listReports(tenantId);
  }

  @Get('reports/:id')
  @RequirePermission('analytics.read')
  async getReport(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<AnalyticsReport | null> {
    return this.repo.getReport(tenantId, id);
  }

  @Post('reports')
  @RequirePermission('analytics.export')
  async createReport(
    @TenantId() tenantId: string,
    @Body() report: CreateReportDto,
  ): Promise<AnalyticsReport> {
    return this.repo.createReport(tenantId, report as Omit<AnalyticsReport, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt'>);
  }

  @Put('reports/:id')
  @RequirePermission('analytics.export')
  async updateReport(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateReportDto,
  ): Promise<AnalyticsReport> {
    return this.repo.updateReport(tenantId, id, update);
  }

  @Delete('reports/:id')
  @RequirePermission('analytics.export')
  async deleteReport(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repo.deleteReport(tenantId, id);
  }

  // Report Execution endpoints
  @Get('report-executions')
  @RequirePermission('analytics.read')
  async listReportExecutions(
    @TenantId() tenantId: string,
    @Query('reportId') reportId?: string,
  ): Promise<ReportExecution[]> {
    return this.repo.listReportExecutions(tenantId, reportId);
  }

  @Post('report-executions')
  @RequirePermission('analytics.export')
  async createReportExecution(
    @TenantId() tenantId: string,
    @Body() execution: CreateReportExecutionDto,
  ): Promise<ReportExecution> {
    return this.repo.createReportExecution(tenantId, execution as Omit<ReportExecution, 'id' | 'createdAt' | 'durationMs'>);
  }

  @Put('report-executions/:id')
  @RequirePermission('analytics.export')
  async updateReportExecution(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateReportExecutionDto,
  ): Promise<ReportExecution> {
    return this.repo.updateReportExecution(tenantId, id, update);
  }

  // Model endpoints
  @Get('models')
  @RequirePermission('analytics.read')
  async listModels(
    @TenantId() tenantId: string,
    @Query('modelType') modelType?: string,
  ): Promise<PredictiveModel[]> {
    return this.repo.listModels(tenantId, modelType);
  }

  @Get('models/:id')
  @RequirePermission('analytics.read')
  async getModel(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<PredictiveModel | null> {
    return this.repo.getModel(tenantId, id);
  }

  @Post('models')
  @RequirePermission('analytics.export')
  async createModel(
    @TenantId() tenantId: string,
    @Body() model: CreateModelDto,
  ): Promise<PredictiveModel> {
    return this.repo.createModel(tenantId, model as Omit<PredictiveModel, 'id' | 'createdAt' | 'updatedAt'>);
  }

  @Put('models/:id')
  @RequirePermission('analytics.export')
  async updateModel(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateModelDto,
  ): Promise<PredictiveModel> {
    return this.repo.updateModel(tenantId, id, update);
  }

  // Prediction endpoints
  @Get('predictions')
  @RequirePermission('analytics.read')
  async listPredictions(
    @TenantId() tenantId: string,
    @Query('modelId') modelId?: string,
    @Query('entityType') entityType?: string,
  ): Promise<PredictionResult[]> {
    return this.repo.listPredictions(tenantId, modelId, entityType);
  }

  @Post('predictions')
  @RequirePermission('analytics.export')
  async createPrediction(
    @TenantId() tenantId: string,
    @Body() prediction: CreatePredictionDto,
  ): Promise<PredictionResult> {
    return this.repo.createPrediction(tenantId, prediction as Omit<PredictionResult, 'id' | 'predictedAt'>);
  }

  // Cohort endpoints
  @Get('cohorts')
  @RequirePermission('analytics.read')
  async listCohorts(@TenantId() tenantId: string): Promise<CohortDefinition[]> {
    return this.repo.listCohorts(tenantId);
  }

  @Get('cohorts/:id')
  @RequirePermission('analytics.read')
  async getCohort(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<CohortDefinition | null> {
    return this.repo.getCohort(tenantId, id);
  }

  @Post('cohorts')
  @RequirePermission('analytics.export')
  async createCohort(
    @TenantId() tenantId: string,
    @Body() cohort: CreateCohortDto,
  ): Promise<CohortDefinition> {
    return this.repo.createCohort(tenantId, cohort as Omit<CohortDefinition, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>);
  }

  @Put('cohorts/:id')
  @RequirePermission('analytics.export')
  async updateCohort(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateCohortDto,
  ): Promise<CohortDefinition> {
    return this.repo.updateCohort(tenantId, id, update);
  }

  @Delete('cohorts/:id')
  @RequirePermission('analytics.export')
  async deleteCohort(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repo.deleteCohort(tenantId, id);
  }
}
