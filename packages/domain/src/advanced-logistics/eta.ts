import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

/**
 * Stage 4, S4-2 (FUL-02): advisory ETA prediction.
 *
 * ponytail: this is a coarse heuristic, not a carrier SLA. It blends a
 * carrier-declared transit window with a simple distance-based estimate.
 * Confidence is coarse (HIGH/MEDIUM/LOW) because the inputs are uncertain.
 * When real carrier SLAs are available, swap `predictEta` for a call that
 * consults them; the persistence shape stays the same.
 */

/**
 * Advisory ETA, derived only from signals the platform actually has.
 *
 * `NONE` with a null date is a valid, expected outcome: the UI shows "no ETA
 * available" instead of a number nobody can stand behind (17 §7.5).
 */
export type EtaConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface EtaPrediction {
  id: string;
  tenantId: string;
  shipmentId: string;
  predictedDate: Date | null;
  confidence: EtaConfidence;
  factors: Record<string, number | string>;
  createdAt: Date;
}

export interface EtaInput {
  shipmentId: string;
  /** Shipped-at timestamp; defaults to now if absent. */
  shippedAt?: Date;
  /** Carrier-declared transit days (median of their window). */
  carrierTransitDays?: number;
  /** Great-circle distance in km, if known. */
  distanceKm?: number;
  /** Carrier average speed km/day, if known. Defaults to 400. */
  carrierSpeedKmPerDay?: number;
  origin?: string;
  destination?: string;
  carrier?: string;
  serviceType?: string;
}

const DEFAULT_CARRIER_SPEED_KM_PER_DAY = 400;

/**
 * Pure prediction logic — no I/O. Returns the predicted delivery date and a
 * confidence bucket. Exposed so callers (workers, tests) can use it without
 * a transaction.
 *
 * Algorithm: take the max of (carrier transit days, distance/speed) so we
 * never under-promise a slow route. Confidence drops with uncertainty in the
 * inputs: both signals present = HIGH, one = MEDIUM, neither = LOW.
 */
export function predictEtaValue(input: EtaInput, now: Date = new Date()): {
  predictedDate: Date | null;
  confidence: EtaConfidence;
  factors: Record<string, number | string>;
} {
  const shippedAt = input.shippedAt ?? now;
  const speed = input.carrierSpeedKmPerDay ?? DEFAULT_CARRIER_SPEED_KM_PER_DAY;

  const transitByCarrier =
    typeof input.carrierTransitDays === 'number' && input.carrierTransitDays > 0
      ? input.carrierTransitDays
      : null;
  const transitByDistance =
    typeof input.distanceKm === 'number' && input.distanceKm > 0
      ? Math.ceil(input.distanceKm / speed)
      : null;

  const factors: Record<string, number | string> = {};
  if (transitByCarrier !== null) factors.carrierTransitDays = transitByCarrier;
  if (transitByDistance !== null) {
    factors.distanceKm = input.distanceKm ?? 0;
    factors.estimatedSpeedKmPerDay = speed;
  }

  let days: number;
  let confidence: EtaConfidence;
  if (transitByCarrier !== null && transitByDistance !== null) {
    days = Math.max(transitByCarrier, transitByDistance);
    confidence = 'HIGH';
    factors.source = 'CARRIER_AND_DISTANCE';
  } else if (transitByCarrier !== null) {
    days = transitByCarrier;
    confidence = 'MEDIUM';
    factors.source = 'CARRIER_DECLARED';
  } else if (transitByDistance !== null) {
    days = transitByDistance;
    confidence = 'MEDIUM';
    factors.source = 'DISTANCE_ESTIMATE';
  } else {
    // No provider signal at all. Blueprint 17 §7.5 forbids inventing a date: an
    // ETA the customer can plan around must trace back to something the carrier
    // actually said. Previously this returned "now + 5 days", which looked
    // authoritative and was pure fabrication.
    return { confidence: 'NONE', factors: { source: 'NO_SIGNAL' }, predictedDate: null };
  }

  factors.freshnessAt = shippedAt.toISOString();
  const predictedDate = new Date(shippedAt);
  predictedDate.setUTCDate(predictedDate.getUTCDate() + days);
  return { confidence, factors, predictedDate };
}

/**
 * Persist a prediction. Idempotent per shipment: replaces prior rows for the
 * same tenant+shipment by inserting a fresh row (the latest wins by
 * created_at DESC; historical predictions are retained for audit).
 */
export async function persistEtaPrediction(
  tx: DatabaseTransaction,
  tenantId: string,
  input: EtaInput,
  now: Date = new Date(),
): Promise<EtaPrediction> {
  const { predictedDate, confidence, factors } = predictEtaValue(input, now);
  const id = randomUUID();
  const rows = await tx`
    INSERT INTO chai.eta_prediction
      (id, tenant_id, shipment_id, predicted_date, confidence, factors)
    VALUES
      (${id}, ${tenantId}, ${input.shipmentId},
       ${predictedDate ? predictedDate.toISOString().slice(0, 10) : null},
       ${confidence}, ${JSON.stringify(factors)}::jsonb)
    RETURNING * FROM chai.eta_prediction
  `;
  const row = rows[0];
  if (!row) throw new Error('eta insert returned no row');
  return toRecord(row as Record<string, unknown>);
}

export async function latestEtaPrediction(
  tx: DatabaseTransaction,
  tenantId: string,
  shipmentId: string,
): Promise<EtaPrediction | null> {
  const rows = await tx`
    SELECT * FROM chai.eta_prediction
    WHERE tenant_id = ${tenantId} AND shipment_id = ${shipmentId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows.length === 0 ? null : toRecord(rows[0] as Record<string, unknown>);
}

/**
 * Convenience: predict + persist in one call. Most callers want this; the
 * split exists for the pure-prediction tests and for workers that only need
 * the value.
 */
export async function predictEta(
  tx: DatabaseTransaction,
  tenantId: string,
  input: EtaInput,
  now: Date = new Date(),
): Promise<EtaPrediction> {
  return persistEtaPrediction(tx, tenantId, input, now);
}

function toRecord(row: Record<string, unknown>): EtaPrediction {
  const factorsRaw = row.factors as unknown;
  let factors: Record<string, number | string> = {};
  if (factorsRaw && typeof factorsRaw === 'object') {
    factors = factorsRaw as Record<string, number | string>;
  }
  return {
    confidence: row.confidence as EtaConfidence,
    createdAt: new Date(row.created_at as string),
    factors,
    id: row.id as string,
    // Null is a real outcome: no provider signal means no ETA at all.
    predictedDate:
      row.predicted_date === null || row.predicted_date === undefined
        ? null
        : new Date(row.predicted_date as string),
    shipmentId: row.shipment_id as string,
    tenantId: row.tenant_id as string,
  };
}
