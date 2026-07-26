import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import {
  MarketplaceRepository,
  InMemoryMarketplaceRepository,
  PostgresMarketplaceRepository,
} from './marketplace.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MarketplaceController],
  providers: [
    {
      provide: MarketplaceRepository,
      useClass: process.env.DATABASE_URL
        ? PostgresMarketplaceRepository
        : InMemoryMarketplaceRepository,
    },
  ],
  exports: [MarketplaceRepository],
})
export class MarketplaceModule {}
