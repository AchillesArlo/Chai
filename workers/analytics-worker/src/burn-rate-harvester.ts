// Burn-rate harvester job (blueprint 12 §5, ADR-007/ADR-019).
//
// Walks the tenant roster, samples the outbox-delivery SLI per window under
// each tenant's RLS context, evaluates the multi-window burn-rate policy, and
// forwards firing alerts. Sampling and forwarding for one tenant happen in the
// SAME transaction, so an alert is only emitted against counts that were read
// under the same tenant isolation that guards the write.

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
  type TenantContext,
} from '@chai/database';
import {
  appendOutboxEvent,
  evaluateBurnRateAlerts,
  sampleOutboxDelivery,
  type BurnRateAlert,
  type BurnRateSample,
  type SloObjective,
} from '@chai/domain';

/** A firing alert bound to the tenant it fired for. */
export interface BurnRateAlertEntry {
  alert: BurnRateAlert;
  tenantId: string;
}

/**
 * Where firing alerts go. A port so the harvest logic can be tested without a
 * broker and so the delivery mechanism can change without touching the job.
 */
export interface BurnRateAlertSink {
  record(transaction: DatabaseTransaction, entry: BurnRateAlertEntry): Promise<void>;
}

/**
 * Default sink: forwards each firing alert as a canonical outbox event, the
 * existing durable, tenant-scoped store-and-forward mechanism (ADR-007). The
 * ObservabilityRepository is in-memory only, so a separate worker process can
 * neither reach nor durably persist through it; the outbox is what actually
 * survives a restart and reaches realtime/automation consumers.
 */
export const outboxBurnRateAlertSink: BurnRateAlertSink = {
  async record(transaction, entry) {
    await appendOutboxEvent(transaction, {
      // The aggregate is the tenant's SLO stream; aggregateId must be a uuid and
      // the tenant id is one. partitionKey keeps one SLO's alerts in order.
      aggregateId: entry.tenantId,
      aggregateType: 'slo',
      aggregateVersion: 0,
      eventType: 'observability.burn_rate.alert.fired',
      partitionKey: entry.alert.sloId,
      payload: entry.alert,
      tenantId: entry.tenantId,
    });
  },
};

/** Outcome of harvesting one tenant. */
export interface TenantBurnRateReport {
  /** Alerts whose long AND short window both crossed the threshold. */
  firing: BurnRateAlert[];
  /** Rules skipped because a window had no data — NOT treated as healthy. */
  notEvaluated: string[];
  tenantId: string;
}

type TenantRunner = <T>(
  database: Database,
  context: TenantContext,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
) => Promise<T>;

type OutboxSampler = (
  transaction: DatabaseTransaction,
  options: { asOf: Date },
) => Promise<BurnRateSample[]>;

export interface RunBurnRateHarvestConfig {
  /** Instant the trailing windows are measured back from. Defaults to now. */
  asOf?: Date;
  database: Database;
  objective: SloObjective;
  /** Overridable for tests; defaults to the RLS-scoped tenant transaction. */
  runInTenant?: TenantRunner;
  /** Overridable for tests; defaults to sampling the outbox-delivery SLI. */
  sampler?: OutboxSampler;
  /** Overridable for tests; defaults to forwarding via the outbox. */
  sink?: BurnRateAlertSink;
  tenants: readonly TenantContext[];
}

/**
 * Harvests burn-rate samples and forwards firing alerts for every tenant.
 *
 * Returns one report per tenant so callers can log/observe both the alerts that
 * fired and the rules that could not be evaluated. A tenant whose outbox has no
 * decided events in any window produces zero samples: every rule lands in
 * `notEvaluated` and nothing is reported as healthy.
 */
export async function runBurnRateHarvest(
  config: RunBurnRateHarvestConfig,
): Promise<TenantBurnRateReport[]> {
  const asOf = config.asOf ?? new Date();
  const runInTenant = config.runInTenant ?? withTenantTransaction;
  const sampler = config.sampler ?? ((transaction, options) => sampleOutboxDelivery(transaction, options));
  const sink = config.sink ?? outboxBurnRateAlertSink;

  const reports: TenantBurnRateReport[] = [];
  for (const tenant of config.tenants) {
    const report = await runInTenant(config.database, tenant, async (transaction) => {
      const samples = await sampler(transaction, { asOf });
      const { alerts, notEvaluated } = evaluateBurnRateAlerts(config.objective, samples);
      const firing = alerts.filter((alert) => alert.firing);
      for (const alert of firing) {
        await sink.record(transaction, { alert, tenantId: tenant.tenantId });
      }
      return { firing, notEvaluated, tenantId: tenant.tenantId };
    });
    reports.push(report);
  }
  return reports;
}
