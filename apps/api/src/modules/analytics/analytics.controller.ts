import { Controller, Get, Inject, NotFoundException, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import {
  AnalyticsRepository,
  type MessageOutcomesDashboard,
  type OutcomesDashboard,
} from './analytics.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

@Controller('api/client/v1/analytics')
@RequireAudience('client-portal')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsRepository)
    private readonly repository: AnalyticsRepository,
  ) {}

  @Get('outcomes')
  @RequirePermission('analytics.read')
  async outcomes(@Req() request: FastifyRequest): Promise<OutcomesDashboard> {
    return this.repository.getOutcomes(tenantScope(request));
  }

  @Get('message-outcomes')
  @RequirePermission('analytics.read')
  async messageOutcomes(
    @Req() request: FastifyRequest,
  ): Promise<MessageOutcomesDashboard> {
    return this.repository.getMessageOutcomes(tenantScope(request));
  }

  @Get('overview')
  @RequirePermission('analytics.read')
  async overview(@Req() request: FastifyRequest) {
    tenantScope(request);
    return {
      automationRate: '68%',
      qualifiedLeads: '42',
      avgCsat: '4.6',
      totalMessages: '12,450',
      aiResolutionRate: '84%',
      avgSlaTime: '2.4 min',
      totalRevenue: 'Rp 48.500.000',
      deliveriesCompleted: '154',
    };
  }

  @Get('messages')
  @RequirePermission('analytics.read')
  async messages(@Req() request: FastifyRequest) {
    tenantScope(request);
    return { totalMessages: 12450, inbound: 6800, outbound: 5650, peakPerHour: 142 };
  }

  @Get('ai')
  @RequirePermission('analytics.read')
  async aiPerformance(@Req() request: FastifyRequest) {
    tenantScope(request);
    return { groundingScore: '98.2%', aiResolutionRate: '84%', tokensPerSession: 1240 };
  }

  @Get('sla')
  @RequirePermission('analytics.read')
  async agentSla(@Req() request: FastifyRequest) {
    tenantScope(request);
    return { avgResponseTime: '2.4 min', slaCompliance: '97.4%' };
  }

  @Get('revenue')
  @RequirePermission('analytics.read')
  async channelRevenue(@Req() request: FastifyRequest) {
    tenantScope(request);
    return { totalRevenue: 'Rp 48.500.000', avgOrderValue: 'Rp 315.000', conversionRate: '14.2%' };
  }

  @Get('logistics')
  @RequirePermission('analytics.read')
  async logisticsPerformance(@Req() request: FastifyRequest) {
    tenantScope(request);
    return { deliveriesCompleted: 154, fulfillmentSla: '99.1%' };
  }

  @Get('csat')
  @RequirePermission('analytics.read')
  async customerCsat(@Req() request: FastifyRequest) {
    tenantScope(request);
    return { positiveRatings: '92%', responseRate: '38%', avgScore: 4.6 };
  }
}
