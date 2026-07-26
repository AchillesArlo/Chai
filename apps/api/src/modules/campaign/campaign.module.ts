import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignRepository, InMemoryCampaignRepository } from './campaign.repository';

@Module({
  controllers: [CampaignController],
  providers: [{ provide: CampaignRepository, useClass: InMemoryCampaignRepository }],
  exports: [CampaignRepository],
})
export class CampaignModule {}
