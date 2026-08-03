import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { WidgetRepository } from './widget.repository';

const WIDGET_TYPE = ['chat', 'contact_form', 'faq', 'hybrid'] as const;
const WIDGET_POSITION = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
const WIDGET_STATUS = ['active', 'inactive', 'maintenance'] as const;
const WIDGET_SESSION_STATUS = ['active', 'ended', 'abandoned'] as const;

class CreateWidgetDto {
  @IsArray()
  @IsString({ each: true })
  allowedOrigins!: string[];

  @IsBoolean()
  analyticsEnabled!: boolean;

  /** Business-hours schedule; caller-defined structure. */
  @IsOptional()
  @IsObject()
  businessHours!: Record<string, unknown> | null;

  @IsString()
  domain!: string;

  @IsOptional()
  @IsString()
  embedCode!: string | null;

  @IsOptional()
  @IsString()
  greetingMessage!: string | null;

  @IsString()
  language!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  offlineMessage!: string | null;

  @IsIn(WIDGET_POSITION)
  position!: (typeof WIDGET_POSITION)[number];

  @IsIn(WIDGET_STATUS)
  status!: (typeof WIDGET_STATUS)[number];

  /** Visual theme tokens; caller-defined structure. */
  @IsObject()
  theme!: Record<string, unknown>;

  @IsIn(WIDGET_TYPE)
  widgetType!: (typeof WIDGET_TYPE)[number];
}

class UpdateWidgetDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsBoolean()
  analyticsEnabled?: boolean;

  @IsOptional()
  @IsObject()
  businessHours?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  embedCode?: string;

  @IsOptional()
  @IsString()
  greetingMessage?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  offlineMessage?: string;

  @IsOptional()
  @IsIn(WIDGET_POSITION)
  position?: (typeof WIDGET_POSITION)[number];

  @IsOptional()
  @IsIn(WIDGET_STATUS)
  status?: (typeof WIDGET_STATUS)[number];

  @IsOptional()
  @IsObject()
  theme?: Record<string, unknown>;

  @IsOptional()
  @IsIn(WIDGET_TYPE)
  widgetType?: (typeof WIDGET_TYPE)[number];
}

class CreateWidgetSessionDto {
  @IsOptional()
  @IsString()
  contactId!: string | null;

  @IsOptional()
  @IsString()
  conversationId!: string | null;

  @IsOptional()
  @IsString()
  ipAddress!: string | null;

  @IsOptional()
  @IsString()
  landingPage!: string | null;

  /** Visitor-supplied context; opaque to the runtime. */
  @IsObject()
  metadata!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  referrerUrl!: string | null;

  @IsISO8601()
  startedAt!: string;

  @IsIn(WIDGET_SESSION_STATUS)
  status!: (typeof WIDGET_SESSION_STATUS)[number];

  @IsOptional()
  @IsString()
  userAgent!: string | null;

  @IsOptional()
  @IsString()
  visitorId!: string | null;

  @IsString()
  widgetId!: string;
}

class UpdateWidgetSessionDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsISO8601()
  endedAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsIn(WIDGET_SESSION_STATUS)
  status?: (typeof WIDGET_SESSION_STATUS)[number];
}

@Controller('api/client/v1/widgets')
export class WidgetController {
  constructor(
    @Inject('WidgetRepository') private readonly repo: WidgetRepository,
  ) {}

  @Get()
  @RequirePermission('channel.read')
  async listWidgets(@TenantId() tenantId: string) {
    return this.repo.listWidgets(tenantId);
  }

  @Get(':id')
  @RequirePermission('channel.read')
  async getWidget(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getWidget(tenantId, id);
  }

  @Post()
  @RequirePermission('channel.manage')
  async createWidget(@TenantId() tenantId: string, @Body() body: CreateWidgetDto) {
    return this.repo.createWidget(tenantId, body);
  }

  @Put(':id')
  @RequirePermission('channel.manage')
  async updateWidget(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdateWidgetDto) {
    return this.repo.updateWidget(tenantId, id, body);
  }

  @Delete(':id')
  @RequirePermission('channel.manage')
  async deleteWidget(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.deleteWidget(tenantId, id);
  }

  // Public end-customer widget runtime (no tenant scope, no principal): left
  // without @RequirePermission per authz mapping rule 5. See task report.
  @Get(':widgetId/sessions')
  async listSessions(@Param('widgetId') widgetId: string, @Query('status') status?: string) {
    return this.repo.listSessions(widgetId, status);
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    return this.repo.getSession(id);
  }

  @Post('sessions')
  async createSession(@Body() body: CreateWidgetSessionDto) {
    return this.repo.createSession(body);
  }

  @Put('sessions/:id')
  async updateSession(@Param('id') id: string, @Body() body: UpdateWidgetSessionDto) {
    return this.repo.updateSession(id, body);
  }
}
