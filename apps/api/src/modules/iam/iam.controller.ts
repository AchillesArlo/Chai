import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsEnum, IsString } from 'class-validator';

import {
  authorize,
  type AuthorizationDenialReason,
  CLIENT_ROLES,
  type ClientRole,
  type Principal,
} from '@chai/auth';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { IamRepository } from './iam.repository';
import type { InviteMemberInput, TeamMember } from './iam.repository';

function tenantScope(request: FastifyRequest): { principalId: string; tenantId: string } {
  const context = request.tenantContext;
  if (!context) {
    throw new NotFoundException();
  }
  return context;
}

function decide(
  request: FastifyRequest,
  permission: 'tenant.team.read' | 'tenant.team.manage',
): void {
  const principal: Principal | undefined = request.principal;
  const tenant = request.tenantContext?.tenantId;
  if (!principal || !tenant) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }
  const decision = authorize({
    audience: 'client-portal',
    now: new Date(),
    permission,
    principal,
    resource: { tenantId: tenant },
  });
  if (!decision.allowed) {
    throw new ForbiddenException({ code: decision.reason satisfies AuthorizationDenialReason });
  }
}

class InviteMemberBody {
  @IsEnum(CLIENT_ROLES)
  role!: ClientRole;

  @IsString()
  userId!: string;
}

class UpdateRoleBody {
  @IsEnum(CLIENT_ROLES)
  role!: ClientRole;
}

@Controller('api/client/v1/team')
@RequireAudience('client-portal')
export class IamController {
  constructor(@Inject(IamRepository) private readonly repository: IamRepository) {}

  @Get()
  @RequirePermission('tenant.team.read')
  async list(@Req() request: FastifyRequest): Promise<TeamMember[]> {
    decide(request, 'tenant.team.read');
    const { tenantId } = tenantScope(request);
    return this.repository.listMemberships(tenantId);
  }

  @Post()
  @RequirePermission('tenant.team.manage')
  async invite(
    @Body() body: InviteMemberBody,
    @Req() request: FastifyRequest,
  ): Promise<TeamMember> {
    decide(request, 'tenant.team.manage');
    const { tenantId } = tenantScope(request);
    const input: InviteMemberInput = { role: body.role, userId: body.userId };
    return this.repository.createMembership(tenantId, input);
  }

  @Patch(':id')
  @RequirePermission('tenant.team.manage')
  async updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleBody,
    @Req() request: FastifyRequest,
  ): Promise<TeamMember> {
    decide(request, 'tenant.team.manage');
    const { tenantId } = tenantScope(request);
    const updated = await this.repository.updateMembershipRole(
      tenantId,
      id,
      body.role,
    );
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Post(':id/accept')
  @RequirePermission('tenant.team.manage')
  @HttpCode(200)
  async accept(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<TeamMember> {
    decide(request, 'tenant.team.manage');
    const { tenantId } = tenantScope(request);
    const accepted = await this.repository.acceptInvitation(tenantId, id);
    if (!accepted) throw new NotFoundException();
    return accepted;
  }

  @Delete(':id')
  @RequirePermission('tenant.team.manage')
  @HttpCode(204)
  async revoke(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    decide(request, 'tenant.team.manage');
    const { tenantId } = tenantScope(request);
    const revoked = await this.repository.revokeMembership(tenantId, id);
    if (!revoked) throw new NotFoundException();
  }
}
