import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AIAgentRepository } from './ai-agent.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { AgentProfile, AgentSession, ToolPolicy } from './ai-agent.repository';

@Controller('api/client/v1/ai-agent')
@UseGuards(TenantGuard)
@RequireAudience('owner-console')
export class AIAgentController {
  constructor(private readonly repo: AIAgentRepository) {}

  @Get('profiles')
  @RequirePermission('platform.ai.manage')
  async listProfiles(@TenantId() tenantId: string) { return this.repo.listProfiles(tenantId); }

  @Get('profiles/:id')
  @RequirePermission('platform.ai.manage')
  async getProfile(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getProfile(tenantId, id); }

  @Post('profiles')
  @RequirePermission('platform.ai.manage')
  async createProfile(@TenantId() tenantId: string, @Body() profile: Omit<AgentProfile, 'id' | 'createdAt' | 'updatedAt'>) { return this.repo.createProfile(tenantId, profile); }

  @Put('profiles/:id')
  @RequirePermission('platform.ai.manage')
  async updateProfile(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<AgentProfile>) { return this.repo.updateProfile(tenantId, id, update); }

  @Delete('profiles/:id')
  @RequirePermission('platform.ai.manage')
  async deleteProfile(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteProfile(tenantId, id); }

  @Get('sessions')
  @RequirePermission('platform.ai.manage')
  async listSessions(@TenantId() tenantId: string, @Query('agentProfileId') agentProfileId?: string) { return this.repo.listSessions(tenantId, agentProfileId); }

  @Post('sessions')
  @RequirePermission('platform.ai.manage')
  async createSession(@TenantId() tenantId: string, @Body() session: Omit<AgentSession, 'id' | 'createdAt' | 'updatedAt' | 'startedAt' | 'endedAt' | 'messagesCount'>) { return this.repo.createSession(tenantId, session); }

  @Put('sessions/:id')
  @RequirePermission('platform.ai.manage')
  async updateSession(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<AgentSession>) { return this.repo.updateSession(tenantId, id, update); }

  @Get('tool-policies')
  @RequirePermission('platform.ai.manage')
  async listToolPolicies(@TenantId() tenantId: string, @Query('agentProfileId') agentProfileId?: string) { return this.repo.listToolPolicies(tenantId, agentProfileId); }

  @Post('tool-policies')
  @RequirePermission('platform.ai.manage')
  async createToolPolicy(@TenantId() tenantId: string, @Body() policy: Omit<ToolPolicy, 'id' | 'createdAt' | 'updatedAt'>) { return this.repo.createToolPolicy(tenantId, policy); }

  @Put('tool-policies/:id')
  @RequirePermission('platform.ai.manage')
  async updateToolPolicy(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<ToolPolicy>) { return this.repo.updateToolPolicy(tenantId, id, update); }

  @Delete('tool-policies/:id')
  @RequirePermission('platform.ai.manage')
  async deleteToolPolicy(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteToolPolicy(tenantId, id); }
}
