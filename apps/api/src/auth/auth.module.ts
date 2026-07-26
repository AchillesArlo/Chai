import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { AudienceGuard } from './audience.guard';
import {
  ClientLoginController,
  OwnerLoginController,
} from './login.controller';
import {
  CredentialStoreToken,
  createCredentialStore,
} from './credential-store.di';
import { OwnerMfaController } from './mfa.controller';
import {
  TOKEN_CONFIG_TOKEN,
  createTokenConfigProvider,
} from './token-config.di';
import {
  ClientSessionController,
  OwnerSessionController,
} from './session.controller';

export { AudienceGuard as AUDIENCE_GUARD };

@Module({
  controllers: [
    OwnerLoginController,
    ClientLoginController,
    OwnerSessionController,
    ClientSessionController,
    OwnerMfaController,
  ],
  providers: [
    AudienceGuard,
    {
      provide: CredentialStoreToken,
      inject: [DATABASE],
      useFactory: (database: DatabaseHandle) => createCredentialStore(database),
    },
    {
      provide: TOKEN_CONFIG_TOKEN,
      useFactory: createTokenConfigProvider,
    },
  ],
  exports: [CredentialStoreToken, TOKEN_CONFIG_TOKEN, AudienceGuard],
})
// NestJS discovers module metadata from this decorated class.
export class AuthModule {}
