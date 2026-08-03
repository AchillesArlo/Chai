import { TenantId } from '../../common/tenant-id.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { assertRecentAuthentication } from '../../guards/high-risk';
import { AuditPort } from '../shared/audit.port';
import { ConnectorConfigRepository } from './connector-config.repository';
import { SecretService } from '../secret/secret.service';

const CONNECTOR_STATUS = ['active', 'inactive', 'error', 'testing'] as const;

class CreateConfigDto {
  @IsString()
  configHash!: string;

  /** Declarative connector settings schema; caller-defined structure. */
  @IsObject()
  configSchema!: Record<string, unknown>;

  // Encrypted config bytes arrive base64-encoded because JSON has no binary
  // type; the controller decodes to a Buffer before persistence.
  @IsOptional()
  @IsString()
  configValuesEncrypted!: string | null;

  @IsString()
  connectorProvider!: string;

  @IsString()
  connectorType!: string;

  @IsString()
  createdBy!: string;

  @IsOptional()
  @IsString()
  description!: string | null;

  @IsOptional()
  @IsString()
  lastError!: string | null;

  @IsOptional()
  @IsISO8601()
  lastTestedAt!: string | null;

  @IsString()
  name!: string;

  @IsIn(CONNECTOR_STATUS)
  status!: (typeof CONNECTOR_STATUS)[number];

  @IsOptional()
  @IsString()
  updatedBy!: string | null;
}

// configValuesEncrypted is omitted: rotating encrypted material goes through the
// dedicated secrets endpoints, not a general config patch.
class UpdateConfigDto {
  @IsOptional()
  @IsString()
  configHash?: string;

  @IsOptional()
  @IsObject()
  configSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  connectorProvider?: string;

  @IsOptional()
  @IsString()
  connectorType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  lastError?: string;

  @IsOptional()
  @IsISO8601()
  lastTestedAt?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(CONNECTOR_STATUS)
  status?: (typeof CONNECTOR_STATUS)[number];

  @IsOptional()
  @IsString()
  updatedBy?: string;
}

class CreateSecretDto {
  @IsOptional()
  @IsISO8601()
  rotatedAt!: string | null;

  @IsOptional()
  @IsString()
  rotatedBy!: string | null;

  @IsString()
  secretKey!: string;

  // Plaintext secret value; the controller encrypts it via SecretService and
  // stores only the vault reference in the DB. Plaintext never persists.
  @IsString()
  secretPlaintext!: string;

  @IsInt()
  @Min(1)
  secretVersion!: number;
}

class RotateSecretDto {
  // New plaintext value; the controller encrypts and stores a new vault ref.
  @IsString()
  secretPlaintext!: string;

  @IsString()
  rotatedBy!: string;
}

@Controller('api/owner/v1/connector-config')
export class ConnectorConfigController {
  constructor(
    @Inject('ConnectorConfigRepository') private readonly repo: ConnectorConfigRepository,
    private readonly secretService: SecretService,
    private readonly audit: AuditPort,
  ) {}

  @Get('configs')
  @RequirePermission('platform.channel.manage')
  async listConfigs(@TenantId() tenantId: string) {
    return this.repo.listConfigs(tenantId);
  }

  @Get('configs/:id')
  @RequirePermission('platform.channel.manage')
  async getConfig(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getConfig(tenantId, id);
  }

  @Post('configs')
  @RequirePermission('platform.channel.manage')
  async createConfig(@TenantId() tenantId: string, @Body() body: CreateConfigDto) {
    const { configValuesEncrypted, ...rest } = body;
    return this.repo.createConfig(tenantId, {
      ...rest,
      configValuesEncrypted:
        configValuesEncrypted == null ? null : Buffer.from(configValuesEncrypted, 'base64'),
    });
  }

  @Put('configs/:id')
  @RequirePermission('platform.channel.manage')
  async updateConfig(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdateConfigDto) {
    return this.repo.updateConfig(tenantId, id, body);
  }

  @Delete('configs/:id')
  @RequirePermission('platform.channel.manage')
  async deleteConfig(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.deleteConfig(tenantId, id);
  }

  @Get('configs/:id/secrets')
  @RequirePermission('platform.channel.manage')
  async listSecrets(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.listSecrets(tenantId, id);
  }

  @Post('configs/:id/secrets')
  @RequirePermission('platform.channel.manage')
  async createSecret(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: CreateSecretDto,
    @Req() request: FastifyRequest,
  ) {
    // Writing a new connector credential is a secret-rotation action; require
    // a recently-presented credential, not merely a live session (ADR-029).
    assertRecentAuthentication(request);
    const { secretPlaintext, ...rest } = body;
    const secretValueRef = await this.secretService.store(
      tenantId,
      body.secretKey,
      secretPlaintext,
    );
    const created = await this.repo.createSecret(tenantId, {
      ...rest,
      connectorConfigId: id,
      secretValueRef,
      secretValueLegacyEncrypted: null,
    });
    await this.audit.append({
      tenantId,
      eventType: 'connector.secret.created',
      actorType: 'user',
      actorId: request.principal?.id ?? 'unknown',
      resourceType: 'connector_secret',
      resourceId: created.id,
      action: 'create',
      previousState: null,
      newState: { connectorConfigId: id, secretKey: body.secretKey, secretVersion: body.secretVersion },
      metadata: { rotatedBy: body.rotatedBy ?? null },
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      correlationId: null,
    });
    return created;
  }

  @Post('secrets/:id/rotate')
  @RequirePermission('platform.channel.manage')
  async rotateSecret(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: RotateSecretDto,
    @Req() request: FastifyRequest,
  ) {
    // Rotating a connector credential is a high-risk action; require recent
    // authentication (ADR-029) and record an immutable audit entry
    // (REQ-09-029 / REQ-17-049).
    assertRecentAuthentication(request);
    const previous = await this.findSecretForRotation(tenantId, id);
    const secretValueRef = await this.secretService.rotate(
      tenantId,
      previous.secretKey,
      body.secretPlaintext,
    );
    const rotatedAt = new Date().toISOString();
    const updated = await this.repo.rotateSecret(tenantId, id, {
      secretValueRef,
      secretVersion: previous.secretVersion + 1,
      rotatedAt,
      rotatedBy: body.rotatedBy,
    });
    await this.audit.append({
      tenantId,
      eventType: 'connector.secret.rotated',
      actorType: 'user',
      actorId: request.principal?.id ?? 'unknown',
      resourceType: 'connector_secret',
      resourceId: id,
      action: 'update',
      previousState: { secretVersion: previous.secretVersion },
      newState: { secretVersion: updated.secretVersion, rotatedAt, rotatedBy: body.rotatedBy },
      metadata: { connectorConfigId: previous.connectorConfigId, secretKey: previous.secretKey },
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      correlationId: null,
    });
    return updated;
  }

  /**
   * Lookup a secret across all configs owned by `tenantId` so the rotate
   * endpoint can find it without a configId parameter. Throws if not found.
   */
  private async findSecretForRotation(tenantId: string, id: string) {
    const configs = await this.repo.listConfigs(tenantId);
    for (const c of configs) {
      const secrets = await this.repo.listSecrets(tenantId, c.id);
      const found = secrets.find((s) => s.id === id);
      if (found) return found;
    }
    throw new Error('Connector secret not found');
  }

  @Delete('secrets/:id')
  @RequirePermission('platform.channel.manage')
  async deleteSecret(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    assertRecentAuthentication(request);
    return this.repo.deleteSecret(tenantId, id);
  }
}
