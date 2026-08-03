import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import {
  MarketplaceRepository,
  InMemoryMarketplaceRepository,
  PostgresMarketplaceRepository,
} from './marketplace.repository';
import { DatabaseModule, DATABASE } from '../../database/database.module';
import { SecretModule } from '../secret/secret.module';
import { SecretService } from '../secret/secret.service';

@Module({
  imports: [DatabaseModule, SecretModule],
  controllers: [MarketplaceController],
  providers: [
    {
      provide: MarketplaceRepository,
      useFactory: (database: unknown, secretService: SecretService): MarketplaceRepository =>
        process.env.DATABASE_URL
          ? new PostgresMarketplaceRepository(database as never, secretService)
          : new InMemoryMarketplaceRepository(),
      inject: [DATABASE, SecretService],
    },
  ],
  exports: [MarketplaceRepository],
})
export class MarketplaceModule {}
