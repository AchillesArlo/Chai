import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { AIAgentRepository } from './ai-agent.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';

class CreateProfileDto {
  @IsString()
  name!: string;

  @IsString()
  useCase!: string;

  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])
  status!: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  tone!: string | null;

  @IsString()
  language!: string;

  @IsObject()
  businessRules!: Record<string, unknown>;

  @IsObject()
  handoverPolicy!: Record<string, unknown>;
}

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  useCase?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  tone?: string | null;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsObject()
  businessRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  handoverPolicy?: Record<string, unknown>;
}

class CreateSessionDto {
  @IsString()
  agentProfileId!: string;

  @IsString()
  conversationId!: string;

  @IsIn(['ACTIVE', 'COMPLETED', 'FAILED', 'HANDOVER'])
  status!: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'HANDOVER';

  @IsObject()
  context!: Record<string, unknown>;
}

class UpdateSessionDto {
  @IsOptional()
  @IsString()
  agentProfileId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'COMPLETED', 'FAILED', 'HANDOVER'])
  status?: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'HANDOVER';

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  endedAt?: string | null;

  @IsOptional()
  @IsInt()
  messagesCount?: number;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

class CreateToolPolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  agentProfileId?: string | null;

  @IsOptional()
  @IsString()
  toolName?: string;

  @IsBoolean()
  allowed!: boolean;

  @IsObject()
  constraints!: Record<string, unknown>;
}

class UpdateToolPolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  agentProfileId?: string | null;

  @IsOptional()
  @IsString()
  toolName?: string;

  @IsOptional()
  @IsBoolean()
  allowed?: boolean;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;
}

@Controller('api/client/v1/ai-agent')
@UseGuards(TenantGuard)
@RequireAudience('owner-console')
export class AIAgentController {
  constructor(
    @Inject(AIAgentRepository)
    private readonly repo: AIAgentRepository,
  ) {}

  @Get('profiles')
  @RequirePermission('platform.ai.manage')
  async listProfiles(@TenantId() tenantId: string) { return this.repo.listProfiles(tenantId); }

  @Get('profiles/:id')
  @RequirePermission('platform.ai.manage')
  async getProfile(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getProfile(tenantId, id); }

  @Post('profiles')
  @RequirePermission('platform.ai.manage')
  async createProfile(@TenantId() tenantId: string, @Body() profile: CreateProfileDto) { return this.repo.createProfile(tenantId, profile); }

  @Put('profiles/:id')
  @RequirePermission('platform.ai.manage')
  async updateProfile(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateProfileDto) { return this.repo.updateProfile(tenantId, id, update); }

  @Delete('profiles/:id')
  @RequirePermission('platform.ai.manage')
  async deleteProfile(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteProfile(tenantId, id); }

  @Get('sessions')
  @RequirePermission('platform.ai.manage')
  async listSessions(@TenantId() tenantId: string, @Query('agentProfileId') agentProfileId?: string) { return this.repo.listSessions(tenantId, agentProfileId); }

  @Post('sessions')
  @RequirePermission('platform.ai.manage')
  async createSession(@TenantId() tenantId: string, @Body() session: CreateSessionDto) { return this.repo.createSession(tenantId, session); }

  @Put('sessions/:id')
  @RequirePermission('platform.ai.manage')
  async updateSession(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateSessionDto) { return this.repo.updateSession(tenantId, id, update); }

  @Get('tool-policies')
  @RequirePermission('platform.ai.manage')
  async listToolPolicies(@TenantId() tenantId: string, @Query('agentProfileId') agentProfileId?: string) { return this.repo.listToolPolicies(tenantId, agentProfileId); }

  @Post('tool-policies')
  @RequirePermission('platform.ai.manage')
  async createToolPolicy(@TenantId() tenantId: string, @Body() policy: CreateToolPolicyDto) { return this.repo.createToolPolicy(tenantId, policy); }

  @Put('tool-policies/:id')
  @RequirePermission('platform.ai.manage')
  async updateToolPolicy(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateToolPolicyDto) { return this.repo.updateToolPolicy(tenantId, id, update); }

  @Delete('tool-policies/:id')
  @RequirePermission('platform.ai.manage')
  async deleteToolPolicy(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteToolPolicy(tenantId, id); }
}
