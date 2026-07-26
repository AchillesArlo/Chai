import { Module } from '@nestjs/common';
import { ConnectorConfigController } from './connector-config.controller';
import { InMemoryConnectorConfigRepository } from './connector-config.repository';

@Module({
  controllers: [ConnectorConfigController],
  providers: [
    {
      provide: 'ConnectorConfigRepository',
      useClass: InMemoryConnectorConfigRepository,
    },
  ],
  exports: ['ConnectorConfigRepository'],
})
export class ConnectorConfigModule {}
