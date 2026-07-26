import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

class HealthQuery {
  @ApiPropertyOptional({ enum: ['summary'] })
  @IsIn(['summary'])
  @IsOptional()
  view?: 'summary';
}

@ApiTags('health')
@Controller('api/v1/health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API process health' })
  health(@Query() query: HealthQuery) {
    void query;
    return { service: 'api', status: 'ok' as const };
  }
}
