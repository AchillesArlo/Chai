import type { DatabaseTransaction } from '@chai/database';

export interface SettlementRecord {
  id: string;
  tenantId: string;
  provider: string;
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  settledAt: string;
  settlementRef: string;
}

export interface ListSettlementsInput {
  provider?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

interface SettlementRow {
  created_at: Date;
  fee_amount: string | number;
  gross_amount: string | number;
  id: string;
  net_amount: string | number;
  provider: string;
  settled_at: Date;
  settlement_ref: string;
  tenant_id: string;
}

/**
 * ponytail: plain conditions rather than a dynamic WHERE builder — the three
 * filters cover the dashboard's needs; add a query builder only if ad-hoc
 * filtering lands.
 */
export async function listSettlements(
  transaction: DatabaseTransaction,
  input: ListSettlementsInput = {},
): Promise<SettlementRecord[]> {
  const limit = Math.min(input.limit ?? 100, 500);
  const provider = input.provider;
  const from = input.from;
  const to = input.to;

  const rows = await transaction<SettlementRow[]>`
    SELECT * FROM chai.settlement
    WHERE (${provider ?? null}::text IS NULL OR provider = ${provider ?? null})
      AND (${from ?? null}::timestamptz IS NULL OR settled_at >= ${from ?? null})
      AND (${to ?? null}::timestamptz IS NULL OR settled_at <= ${to ?? null})
    ORDER BY settled_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toRecord);
}

function toRecord(row: SettlementRow): SettlementRecord {
  return {
    feeAmount: Number(row.fee_amount),
    grossAmount: Number(row.gross_amount),
    id: row.id,
    netAmount: Number(row.net_amount),
    provider: row.provider,
    settledAt: row.settled_at.toISOString(),
    settlementRef: row.settlement_ref,
    tenantId: row.tenant_id,
  };
}
