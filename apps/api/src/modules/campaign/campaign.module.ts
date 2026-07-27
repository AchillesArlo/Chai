import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { CampaignController } from './campaign.controller';
import {
  CampaignRepository,
  InMemoryCampaignRepository,
} from './campaign.repository';
import { PostgresCampaignRepository } from './postgres-campaign.repository';

@Module({
  controllers: [CampaignController],
  providers: [
    {
      inject: [DATABASE],
      provide: CampaignRepository,
      useFactory: (database: DatabaseHandle): CampaignRepository =>
        database
          ? new PostgresCampaignRepository(database)
          : // ponytail: e2e without DATABASE_URL stays in-memory.
            new InMemoryCampaignRepository(),
    },
  ],
  exports: [CampaignRepository],
})
// NestJS discovers module metadata from this decorated class.
export class CampaignModule {}
