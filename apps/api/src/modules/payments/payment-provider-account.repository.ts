import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import { SecretService } from '../secret/secret.service';

/**
 * Payment provider account per-tenant (FASE 5 — REQ-17-058).
 *
 * Sebelum ini, `MIDTRANS_SERVER_KEY` global dari env dipakai semua tenant —
 * melanggar isolasi tenant (PAY-01). Tabel `chai.payment_provider_account`
 * (migrasi 0086) menyimpan referensi vault ke kredensial per-tenant; plaintext
 * tidak pernah disimpan di DB.
 *
 * Ponytail: read-only di sini (lookup untuk webhook verification). Endpoint
 * admin untuk create/update account (rotasi teraudit) menyusul — rotasi
 * konektor sudah dicakup connector-config + SecretService.
 */
export interface PaymentProviderAccount {
  id: string;
  tenantId: string;
  provider: string;
  accountRef: string;
  secretRef: string;
  webhookSecretRef: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentProviderAccountRow {
  id: string;
  tenant_id: string;
  provider: string;
  account_ref: string;
  secret_ref: string;
  webhook_secret_ref: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export abstract class PaymentProviderAccountRepository {
  abstract findByTenantAndProvider(
    tenantId: string,
    provider: string,
  ): Promise<PaymentProviderAccount | null>;
  abstract create(
    tenantId: string,
    input: {
      provider: string;
      accountRef: string;
      secretPlaintext: string;
      webhookSecretPlaintext?: string;
      createdBy: string;
    },
  ): Promise<PaymentProviderAccount>;
  /**
   * Resolve plaintext server key untuk (tenantId, provider). Return null jika
   * tenant tidak punya account aktif — caller wajib fallback ke env global
   * (ponytail: transisi).
   */
  abstract resolveServerKey(
    tenantId: string,
    provider: string,
  ): Promise<string | null>;
}

@Injectable()
export class PostgresPaymentProviderAccountRepository extends PaymentProviderAccountRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly secretService: SecretService,
  ) {
    super();
  }

  override async findByTenantAndProvider(
    tenantId: string,
    provider: string,
  ): Promise<PaymentProviderAccount | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<PaymentProviderAccountRow[]>`
          SELECT * FROM chai.payment_provider_account
          WHERE tenant_id = ${tenantId}::uuid
            AND provider = ${provider}
            AND status = 'active'
          LIMIT 1
        `;
        return rows[0] ? this.mapRow(rows[0]) : null;
      },
    );
  }

  override async create(
    tenantId: string,
    input: {
      provider: string;
      accountRef: string;
      secretPlaintext: string;
      webhookSecretPlaintext?: string;
      createdBy: string;
    },
  ): Promise<PaymentProviderAccount> {
    const id = randomUUID();
    const secretRef = await this.secretService.store(
      tenantId,
      `payment_provider:${input.provider}:${input.accountRef}:server_key`,
      input.secretPlaintext,
    );
    const webhookSecretRef = input.webhookSecretPlaintext
      ? await this.secretService.store(
          tenantId,
          `payment_provider:${input.provider}:${input.accountRef}:webhook_secret`,
          input.webhookSecretPlaintext,
        )
      : null;
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<PaymentProviderAccountRow[]>`
          INSERT INTO chai.payment_provider_account (
            id, tenant_id, provider, account_ref, secret_ref, webhook_secret_ref, status, created_by
          ) VALUES (
            ${id}::uuid, ${tenantId}::uuid, ${input.provider}, ${input.accountRef},
            ${secretRef}, ${webhookSecretRef}, 'active', ${input.createdBy}::uuid
          )
          RETURNING *
        `;
        const row = rows[0];
        if (!row) throw new Error('payment_provider_account insert returned no row');
        return this.mapRow(row);
      },
    );
  }

  /**
   * Resolve plaintext server key untuk (tenantId, provider). Return null jika
   * tenant tidak punya account aktif — caller wajib fallback ke env global
   * (ponytail: transisi, komentar di payments repo).
   */
  override async resolveServerKey(
    tenantId: string,
    provider: string,
  ): Promise<string | null> {
    const account = await this.findByTenantAndProvider(tenantId, provider);
    if (!account) return null;
    return this.secretService.retrieve(account.secretRef);
  }

  private mapRow(row: PaymentProviderAccountRow): PaymentProviderAccount {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      provider: row.provider,
      accountRef: row.account_ref,
      secretRef: row.secret_ref,
      webhookSecretRef: row.webhook_secret_ref,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
