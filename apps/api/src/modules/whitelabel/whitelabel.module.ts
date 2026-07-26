import { Module } from '@nestjs/common';
import { WhitelabelController } from './whitelabel.controller';
import {
  WhitelabelRepository,
  InMemoryWhitelabelRepository,
  PostgresWhitelabelRepository,
} from './whitelabel.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [WhitelabelController],
  providers: [
    {
      provide: WhitelabelRepository,
      useClass: process.env.DATABASE_URL
        ? PostgresWhitelabelRepository
        : InMemoryWhitelabelRepository,
    },
  ],
  exports: [WhitelabelRepository],
})
export class WhitelabelModule {}
