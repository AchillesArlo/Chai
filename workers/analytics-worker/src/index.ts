/**
 * Analytics projection worker. Stage 1: fold metric events into a counter map.
 * Full materialised views wait on the fact-table migration.
 */
export * from './burn-rate-harvester';

export interface MetricEvent {
  name: string;
  tenantId: string;
  value: number;
}

export function foldMetrics(
  events: MetricEvent[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const event of events) {
    const key = `${event.tenantId}:${event.name}`;
    totals.set(key, (totals.get(key) ?? 0) + event.value);
  }
  return totals;
}
