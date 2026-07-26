import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import type { FastifyRequest } from 'fastify';

import {
  executeFlow,
  simulateFlow,
  type FlowDefinition,
  type FlowEngineHandlers,
} from '@chai/domain';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import {
  type AutomationFlowRecord,
  type SimulationRecord,
  AutomationBuilderRepository,
} from './automation-builder.repository';

function tenantScope(request: FastifyRequest): { principalId: string; tenantId: string } {
  const context = request.tenantContext;
  if (!context?.tenantId || !context?.principalId) throw new NotFoundException();
  return { tenantId: context.tenantId, principalId: context.principalId };
}

class CreateFlowBody {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  definition?: unknown;
}

class UpdateFlowBody {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  definition?: unknown;
}

class SimulateBody {
  @IsOptional()
  @IsObject()
  input?: unknown;
}

/**
 * Pure handlers used by both the simulation and publish paths. Kept side-effect
 * free at the API layer so the engine result is deterministic; real side
 * effects are emitted by downstream workers subscribing to flow events.
 */
const DEFAULT_HANDLERS: FlowEngineHandlers = {
  actions: {
    sendMessage: (node) => ({ sent: true, template: node.config['template'] ?? 'default' }),
    createLead: (node) => ({ leadId: `lead-${node.id}` }),
    scheduleFollowUp: (node) => ({ scheduled: true, dueAt: node.config['dueAt'] ?? null }),
    notifyAgent: (node) => ({ notified: true, agentId: node.config['agentId'] ?? null }),
    updateStatus: (node) => ({ status: node.config['status'] ?? 'UPDATED' }),
  },
  conditions: {
    checkKeyword: (node, ctx) =>
      typeof ctx.input['message'] === 'string' &&
      typeof node.config['keyword'] === 'string' &&
      (ctx.input['message'] as string).includes(node.config['keyword'] as string),
    checkTime: (node) => node.config['withinHours'] === undefined || true,
    checkTenantAttribute: (node) => node.config['equals'] === undefined || true,
  },
};

@Controller('api/client/v1/automation')
@RequireAudience('client-portal')
export class AutomationBuilderController {
  constructor(
    @Inject(AutomationBuilderRepository) private readonly repository: AutomationBuilderRepository,
  ) {}

  @Get('flows')
  @RequirePermission('automation.read')
  async listFlows(@Req() request: FastifyRequest): Promise<AutomationFlowRecord[]> {
    const { tenantId } = tenantScope(request);
    return this.repository.listFlows(tenantId);
  }

  @Post('flows')
  @RequirePermission('automation.manage')
  @HttpCode(201)
  async createFlow(
    @Body() body: CreateFlowBody,
    @Req() request: FastifyRequest,
  ): Promise<AutomationFlowRecord> {
    const { tenantId, principalId } = tenantScope(request);
    return this.repository.createFlow(tenantId, {
      name: body.name,
      description: body.description,
      definition: body.definition,
      createdBy: principalId,
    });
  }

  @Put('flows/:id')
  @RequirePermission('automation.manage')
  async updateFlow(
    @Param('id') id: string,
    @Body() body: UpdateFlowBody,
    @Req() request: FastifyRequest,
  ): Promise<AutomationFlowRecord> {
    const { tenantId } = tenantScope(request);
    const existing = await this.repository.getFlow(tenantId, id);
    if (!existing) throw new NotFoundException();
    return this.repository.updateFlow(tenantId, id, {
      name: body.name,
      description: body.description,
      definition: body.definition,
    });
  }

  @Post('flows/:id/simulate')
  @RequirePermission('automation.manage')
  @HttpCode(200)
  async simulate(
    @Param('id') id: string,
    @Body() body: SimulateBody,
    @Req() request: FastifyRequest,
  ): Promise<SimulationRecord> {
    const { tenantId } = tenantScope(request);
    const flow = await this.repository.getFlow(tenantId, id);
    if (!flow) throw new NotFoundException();
    const definition = flow.definition as FlowDefinition;
    const input = (body.input as Record<string, unknown>) ?? {};
    const result = simulateFlow(definition, input, DEFAULT_HANDLERS, { tenantId });
    return this.repository.simulate(tenantId, id, {
      input,
      output: result,
      status: result.status,
    });
  }

  @Post('flows/:id/publish')
  @RequirePermission('automation.manage')
  @HttpCode(200)
  async publish(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<{ flow: AutomationFlowRecord }> {
    const { tenantId, principalId } = tenantScope(request);
    const existing = await this.repository.getFlow(tenantId, id);
    if (!existing) throw new NotFoundException();
    const result = await this.repository.publish(tenantId, id, principalId);
    return { flow: result.flow };
  }

  @Get('flows/:id/versions')
  @RequirePermission('automation.read')
  async listVersions(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    const { tenantId } = tenantScope(request);
    const existing = await this.repository.getFlow(tenantId, id);
    if (!existing) throw new NotFoundException();
    return this.repository.listVersions(tenantId, id);
  }
}

// Re-exported for tests that want to drive the engine directly.
export { executeFlow };
