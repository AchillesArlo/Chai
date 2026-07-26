/**
 * Polling fallback for carrier tracking. Marks STALE when last sync exceeds SLA.
 */
export function shouldMarkStale(lastSyncedAt: Date, now: Date, slaMs: number): boolean {
  return now.getTime() - lastSyncedAt.getTime() >= slaMs;
}
