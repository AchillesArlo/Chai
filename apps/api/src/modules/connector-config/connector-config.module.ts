import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { ConnectorConfigController } from './connector-config.controller';
import { InMemoryConnectorConfigRepository, type ConnectorConfigRepository } from './connector-config.repository';
import { PostgresConnectorConfigRepository } from './postgres-connector-config.repository';

@Module({
  controllers: [ConnectorConfigController],
  providers: [
    {
      inject: [DATABASE],
      provide: 'ConnectorConfigRepository',
      useFactory: (database: DatabaseHandle): ConnectorConfigRepository =>
        database
          ? new PostgresConnectorConfigRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryConnectorConfigRepository(),
    },
  ],
  exports: ['ConnectorConfigRepository'],
})
export class ConnectorConfigModule {}
