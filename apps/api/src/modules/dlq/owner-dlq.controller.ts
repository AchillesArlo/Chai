import {
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { DlqRepository, type DeadLetterEntry } from './dlq.repository';

@Controller('api/owner/v1/dead-letters')
@RequireAudience('owner-console')
@RequirePermission('platform.reliability.manage')
export class OwnerDlqController {
  constructor(
    @Inject(DlqRepository)
    private readonly repo: DlqRepository,
  ) {}

  @Get()
  async list(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ): Promise<{ entries: DeadLetterEntry[]; total: number }> {
    const raw = limit ? Number(limit) : 50;
    const capped = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 100) : 50;
    const entries = this.repo.list(tenantId, capped);
    return { entries, total: entries.length };
  }

  @Get('count')
  async count(@Query('tenantId') tenantId?: string): Promise<{ count: number }> {
    return { count: this.repo.count(tenantId) };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<DeadLetterEntry> {
    const entry = this.repo.get(id);
    if (!entry) {
      throw new NotFoundException({ code: 'DEAD_LETTER_NOT_FOUND', id });
    }
    return entry;
  }

  @Post(':id/replay')
  @HttpCode(200)
  async replay(@Param('id') id: string): Promise<{ entry: DeadLetterEntry; replayed: boolean }> {
    const entry = this.repo.replay(id);
    if (!entry) {
      throw new NotFoundException({ code: 'DEAD_LETTER_NOT_FOUND', id });
    }
    return { entry, replayed: true };
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string): Promise<{ rejected: boolean }> {
    const rejected = this.repo.delete(id);
    if (!rejected) {
      throw new NotFoundException({ code: 'DEAD_LETTER_NOT_FOUND', id });
    }
    return { rejected: true };
  }
}
