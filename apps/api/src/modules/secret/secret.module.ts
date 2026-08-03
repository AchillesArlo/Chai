import { Module } from '@nestjs/common';

import { createSecretBackendFromEnv, SecretService } from './secret.service';

/**
 * SecretModule (FASE 5): menyediakan {@link SecretService} ke modul yang
 * menyimpan secret konektor / webhook / payment provider.
 *
 * Backend dipilih dari env saat bootstrap. `createSecretBackendFromEnv`
 * memvalidasi `CHAI_SECRET_MASTER_KEY` wajib ada — tanpa itu, modul gagal
 * dimuat (fail-fast), tidak pernah menyimpan plaintext diam-diam.
 */
@Module({
  providers: [
    {
      provide: 'CHAI_SECRET_BACKEND',
      useFactory: () => createSecretBackendFromEnv(),
    },
    SecretService,
  ],
  exports: [SecretService],
})
export class SecretModule {}
