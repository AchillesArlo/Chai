import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';

import { DlqRepository, type DeadLetterEntry } from './dlq.repository';

@Controller('internal/v1/dlq')
@RequireAudience('service')
@RequirePermission('inbox.dispatch')
export class DlqController {
  constructor(private readonly repo: DlqRepository) {}

  @Get()
  async list(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string
  ): Promise<{ entries: DeadLetterEntry[]; total: number }> {
    const entries = this.repo.list(tenantId, limit ? Number(limit) : 50);
    return { entries, total: entries.length };
  }

  @Get('count')
  async count(@Query('tenantId') tenantId?: string): Promise<{ count: number }> {
    return { count: this.repo.count(tenantId) };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<DeadLetterEntry | null> {
    return this.repo.get(id);
  }

  @Post(':id/replay')
  @HttpCode(200)
  async replay(@Param('id') id: string): Promise<{ replayed: boolean; entry: DeadLetterEntry | null }> {
    const entry = this.repo.replay(id);
    return { entry, replayed: entry !== null };
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string): Promise<{ rejected: boolean }> {
    return { rejected: this.repo.delete(id) };
  }
}
