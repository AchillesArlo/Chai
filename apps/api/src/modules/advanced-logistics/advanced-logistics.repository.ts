import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  approveReturn,
  completeReturn,
  createClaim,
  createReturnRequest,
  investigateClaim,
  latestEtaPrediction,
  predictEta,
  predictEtaValue,
  resolveClaim,
  getClaim,
  getReturn,
  compareRates,
  selectBestRate,
  type CarrierRate,
  type ClaimCategory,
  type ClaimRecord,
  type ClaimStatus,
  type EtaInput,
  type EtaPrediction,
  type RankedRate,
  type RateShopConfig,
  type ReturnRecord,
  type ReturnStatus,
} from '@chai/domain';
import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';

/**
 * Stage 4, S4-2 (FUL-02): advanced logistics port.
 *
 * Rate shopping is pure (no transaction). Returns, claims, and ETA
 * predictions persist via the domain layer's transaction-bound functions.
 * InMemory backs e2e/local; Postgres backs production. Factory swap in module.
 */
export abstract class AdvancedLogisticsRepository {
  abstract shopRates(
    rates: readonly CarrierRate[],
    config?: RateShopConfig,
  ): { ranked: RankedRate[]; best: CarrierRate | null };

  abstract createReturn(
    tenantId: string,
    input: { reason: string; originalShipmentId?: string | null },
  ): Promise<ReturnRecord>;

  abstract approveReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord>;

  abstract completeReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord>;

  abstract getReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord | null>;

  abstract createClaim(
    tenantId: string,
    input: {
      shipmentId?: string | null;
      category: ClaimCategory;
      amountCents: number;
    },
  ): Promise<ClaimRecord>;

  abstract investigateClaim(
    tenantId: string,
    claimId: string,
  ): Promise<ClaimRecord>;

  abstract resolveClaim(
    tenantId: string,
    claimId: string,
    resolution: string,
  ): Promise<ClaimRecord>;

  abstract getClaim(
    tenantId: string,
    claimId: string,
  ): Promise<ClaimRecord | null>;

  abstract predictEta(
    tenantId: string,
    input: EtaInput,
  ): Promise<EtaPrediction>;

  abstract getEta(
    tenantId: string,
    shipmentId: string,
  ): Promise<EtaPrediction | null>;
}

@Injectable()
export class InMemoryAdvancedLogisticsRepository extends AdvancedLogisticsRepository {
  // ponytail: in-memory maps for e2e/local. Not durable, no RLS.
  private readonly returnStore = new Map<string, ReturnRecord>();
  private readonly claimStore = new Map<string, ClaimRecord>();
  private readonly etaStore = new Map<string, EtaPrediction>();

  override shopRates(
    rates: readonly CarrierRate[],
    config?: RateShopConfig,
  ): { ranked: RankedRate[]; best: CarrierRate | null } {
    return {
      best: selectBestRate(rates, config),
      ranked: compareRates(rates, config),
    };
  }

  override async createReturn(
    tenantId: string,
    input: { reason: string; originalShipmentId?: string | null },
  ): Promise<ReturnRecord> {
    const now = new Date();
    const record: ReturnRecord = {
      createdAt: now,
      id: randomUUID(),
      originalShipmentId: input.originalShipmentId ?? null,
      reason: input.reason,
      status: 'PENDING',
      tenantId,
      updatedAt: now,
    };
    this.returnStore.set(record.id, record);
    return { ...record };
  }

  override async approveReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord> {
    return this.transitionReturn(
      tenantId,
      returnId,
      'APPROVED',
      [['PENDING', 'APPROVED']],
    );
  }

  override async completeReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord> {
    return this.transitionReturn(
      tenantId,
      returnId,
      'COMPLETED',
      [['APPROVED', 'COMPLETED']],
    );
  }

  override async getReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord | null> {
    const record = this.returnStore.get(returnId);
    if (!record || record.tenantId !== tenantId) return null;
    return { ...record };
  }

  override async createClaim(
    tenantId: string,
    input: {
      shipmentId?: string | null;
      category: ClaimCategory;
      amountCents: number;
    },
  ): Promise<ClaimRecord> {
    const now = new Date();
    const record: ClaimRecord = {
      amountCents: input.amountCents,
      category: input.category,
      createdAt: now,
      id: randomUUID(),
      resolution: null,
      shipmentId: input.shipmentId ?? null,
      status: 'OPEN',
      tenantId,
      updatedAt: now,
    };
    this.claimStore.set(record.id, record);
    return { ...record };
  }

  override async investigateClaim(
    tenantId: string,
    claimId: string,
  ): Promise<ClaimRecord> {
    return this.transitionClaim(tenantId, claimId, 'INVESTIGATING', [
      ['OPEN', 'INVESTIGATING'],
    ]);
  }

  override async resolveClaim(
    tenantId: string,
    claimId: string,
    resolution: string,
  ): Promise<ClaimRecord> {
    return this.transitionClaim(
      tenantId,
      claimId,
      'RESOLVED',
      [
        ['OPEN', 'RESOLVED'],
        ['INVESTIGATING', 'RESOLVED'],
      ],
      resolution,
    );
  }

  override async getClaim(
    tenantId: string,
    claimId: string,
  ): Promise<ClaimRecord | null> {
    const record = this.claimStore.get(claimId);
    if (!record || record.tenantId !== tenantId) return null;
    return { ...record };
  }

  override async predictEta(
    tenantId: string,
    input: EtaInput,
  ): Promise<EtaPrediction> {
    const { predictedDate, confidence, factors } = predictEtaValue(input);
    const record: EtaPrediction = {
      confidence,
      createdAt: new Date(),
      factors,
      id: randomUUID(),
      predictedDate,
      shipmentId: input.shipmentId,
      tenantId,
    };
    this.etaStore.set(`${tenantId}:${input.shipmentId}`, record);
    return { ...record };
  }

  override async getEta(
    tenantId: string,
    shipmentId: string,
  ): Promise<EtaPrediction | null> {
    const record = this.etaStore.get(`${tenantId}:${shipmentId}`);
    if (!record) return null;
    return { ...record };
  }

  private transitionReturn(
    tenantId: string,
    returnId: string,
    to: ReturnStatus,
    allowed: ReadonlyArray<[ReturnStatus, ReturnStatus]>,
  ): Promise<ReturnRecord> {
    const record = this.returnStore.get(returnId);
    if (!record || record.tenantId !== tenantId) {
      return Promise.reject(new Error('RETURN_NOT_FOUND'));
    }
    const ok = allowed.some(([f]) => f === record.status);
    if (!ok) {
      return Promise.reject(
        new Error(`RETURN_INVALID_TRANSITION:${record.status}->${to}`),
      );
    }
    const updated: ReturnRecord = {
      ...record,
      status: to,
      updatedAt: new Date(),
    };
    this.returnStore.set(returnId, updated);
    return Promise.resolve({ ...updated });
  }

  private transitionClaim(
    tenantId: string,
    claimId: string,
    to: ClaimStatus,
    allowed: ReadonlyArray<[ClaimStatus, ClaimStatus]>,
    resolution?: string,
  ): Promise<ClaimRecord> {
    const record = this.claimStore.get(claimId);
    if (!record || record.tenantId !== tenantId) {
      return Promise.reject(new Error('CLAIM_NOT_FOUND'));
    }
    const ok = allowed.some(([f]) => f === record.status);
    if (!ok) {
      return Promise.reject(
        new Error(`CLAIM_INVALID_TRANSITION:${record.status}->${to}`),
      );
    }
    const updated: ClaimRecord = {
      ...record,
      resolution: resolution ?? record.resolution,
      status: to,
      updatedAt: new Date(),
    };
    this.claimStore.set(claimId, updated);
    return Promise.resolve({ ...updated });
  }
}

@Injectable()
export class PostgresAdvancedLogisticsRepository extends AdvancedLogisticsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override shopRates(
    rates: readonly CarrierRate[],
    config?: RateShopConfig,
  ): { ranked: RankedRate[]; best: CarrierRate | null } {
    // ponytail: pure function, no transaction needed.
    return {
      best: selectBestRate(rates, config),
      ranked: compareRates(rates, config),
    };
  }

  override async createReturn(
    tenantId: string,
    input: { reason: string; originalShipmentId?: string | null },
  ): Promise<ReturnRecord> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => createReturnRequest(tx, tenantId, input),
    );
  }

  override async approveReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => approveReturn(tx, tenantId, returnId),
    );
  }

  override async completeReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => completeReturn(tx, tenantId, returnId),
    );
  }

  override async getReturn(
    tenantId: string,
    returnId: string,
  ): Promise<ReturnRecord | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => getReturn(tx, tenantId, returnId),
    );
  }

  override async createClaim(
    tenantId: string,
    input: {
      shipmentId?: string | null;
      category: ClaimCategory;
      amountCents: number;
    },
  ): Promise<ClaimRecord> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => createClaim(tx, tenantId, input),
    );
  }

  override async investigateClaim(
    tenantId: string,
    claimId: string,
  ): Promise<ClaimRecord> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => investigateClaim(tx, tenantId, claimId),
    );
  }

  override async resolveClaim(
    tenantId: string,
    claimId: string,
    resolution: string,
  ): Promise<ClaimRecord> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) =>
        resolveClaim(tx, tenantId, claimId, resolution),
    );
  }

  override async getClaim(
    tenantId: string,
    claimId: string,
  ): Promise<ClaimRecord | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => getClaim(tx, tenantId, claimId),
    );
  }

  override async predictEta(
    tenantId: string,
    input: EtaInput,
  ): Promise<EtaPrediction> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => predictEta(tx, tenantId, input),
    );
  }

  override async getEta(
    tenantId: string,
    shipmentId: string,
  ): Promise<EtaPrediction | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      (tx: DatabaseTransaction) => latestEtaPrediction(tx, tenantId, shipmentId),
    );
  }
}
