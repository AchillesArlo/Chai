import { TenantId } from '../../common/tenant-id.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ConnectorConfigRepository, InMemoryConnectorConfigRepository } from './connector-config.repository';

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

  // Encrypted secret bytes arrive base64-encoded; decoded to a Buffer below.
  @IsString()
  secretValueEncrypted!: string;

  @IsInt()
  @Min(1)
  secretVersion!: number;
}

@Controller('api/owner/v1/connector-config')
export class ConnectorConfigController {
  private repo: ConnectorConfigRepository;

  constructor() {
    this.repo = new InMemoryConnectorConfigRepository();
  }

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
  async listSecrets(@Param('id') id: string) {
    return this.repo.listSecrets(id);
  }

  @Post('configs/:id/secrets')
  @RequirePermission('platform.channel.manage')
  async createSecret(@Param('id') id: string, @Body() body: CreateSecretDto) {
    const { secretValueEncrypted, ...rest } = body;
    return this.repo.createSecret({
      ...rest,
      connectorConfigId: id,
      secretValueEncrypted: Buffer.from(secretValueEncrypted, 'base64'),
    });
  }

  @Delete('secrets/:id')
  @RequirePermission('platform.channel.manage')
  async deleteSecret(@Param('id') id: string) {
    return this.repo.deleteSecret(id);
  }
}
