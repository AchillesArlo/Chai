import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdvancedAnalyticsRepository } from './advanced-analytics.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { AnalyticsDashboard, AnalyticsReport, ReportExecution, PredictiveModel, PredictionResult, CohortDefinition } from './advanced-analytics.repository';

@Controller('api/client/v1/advanced-analytics')
@UseGuards(TenantGuard)
export class AdvancedAnalyticsController {
  constructor(private readonly repo: AdvancedAnalyticsRepository) {}

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
    @Body() dashboard: Omit<AnalyticsDashboard, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AnalyticsDashboard> {
    return this.repo.createDashboard(tenantId, dashboard);
  }

  @Put('dashboards/:id')
  @RequirePermission('analytics.export')
  async updateDashboard(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<AnalyticsDashboard>,
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
    @Body() report: Omit<AnalyticsReport, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt'>,
  ): Promise<AnalyticsReport> {
    return this.repo.createReport(tenantId, report);
  }

  @Put('reports/:id')
  @RequirePermission('analytics.export')
  async updateReport(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<AnalyticsReport>,
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
    @Body() execution: Omit<ReportExecution, 'id' | 'createdAt' | 'durationMs'>,
  ): Promise<ReportExecution> {
    return this.repo.createReportExecution(tenantId, execution);
  }

  @Put('report-executions/:id')
  @RequirePermission('analytics.export')
  async updateReportExecution(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<ReportExecution>,
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
    @Body() model: Omit<PredictiveModel, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PredictiveModel> {
    return this.repo.createModel(tenantId, model);
  }

  @Put('models/:id')
  @RequirePermission('analytics.export')
  async updateModel(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<PredictiveModel>,
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
    @Body() prediction: Omit<PredictionResult, 'id' | 'predictedAt'>,
  ): Promise<PredictionResult> {
    return this.repo.createPrediction(tenantId, prediction);
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
    @Body() cohort: Omit<CohortDefinition, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>,
  ): Promise<CohortDefinition> {
    return this.repo.createCohort(tenantId, cohort);
  }

  @Put('cohorts/:id')
  @RequirePermission('analytics.export')
  async updateCohort(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<CohortDefinition>,
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
