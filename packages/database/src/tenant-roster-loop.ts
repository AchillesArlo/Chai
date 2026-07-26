import type { Database } from './client';
import { readActiveTenantRoster } from './tenant-context';
import type { TenantContext } from './tenant-context';

export interface TenantRosterLoopOptions {
  database: Database;
  /** Identifies the worker in log lines. */
  name: string;
  /**
   * Obsolete env var that used to carry a hand-maintained roster. Rejected at
   * start when populated: a leftover value an operator believes still constrains
   * tenant coverage is a silent second source of truth.
   */
  obsoleteRosterEnv?: string;
  /** How often the roster is re-read, in milliseconds. */
  refreshMs?: number;
  /**
   * One work window. It must return when `signal` aborts — the loop uses that to
   * end the window and refresh the roster.
   */
  run: (input: { signal: AbortSignal; tenants: TenantContext[] }) => Promise<void>;
  /** Aborted on SIGTERM/SIGINT by the caller. */
  signal: AbortSignal;
}

const DEFAULT_REFRESH_MS = 30_000;

/**
 * Runs a worker loop against the live tenant roster.
 *
 * Every worker needs the same three behaviours, and getting any of them wrong is
 * a production incident rather than a style preference, so they live here once
 * instead of being re-typed per worker:
 *
 * 1. The roster comes from `chai.active_tenant_roster()`, so a newly activated
 *    tenant is picked up without a redeploy. A hand-maintained env list silently
 *    excludes new tenants and lets their events pile up undelivered.
 * 2. The FIRST read is fail-hard. A worker running with an empty roster looks
 *    healthy while doing nothing at all.
 * 3. A LATER failed refresh is not fatal: keep serving the last known roster and
 *    retry next window. A transient database hiccup must not stop delivery.
 */
export async function runWithTenantRoster(
  options: TenantRosterLoopOptions,
): Promise<void> {
  const { database, name, run, signal } = options;
  rejectObsoleteRosterEnv(options.obsoleteRosterEnv);
  const refreshMs =
    options.refreshMs && options.refreshMs > 0 ? options.refreshMs : DEFAULT_REFRESH_MS;

  let tenants = await readActiveTenantRoster(database);

  while (!signal.aborted) {
    // The window ends at whichever comes first: shutdown, or the refresh
    // interval. `AbortSignal.any` lets a shutdown cut a long window short.
    const windowSignal = AbortSignal.any([signal, AbortSignal.timeout(refreshMs)]);
    await run({ signal: windowSignal, tenants });

    if (signal.aborted) break;

    try {
      tenants = await readActiveTenantRoster(database);
    } catch (error) {
      console.error(
        `${name}: tenant roster refresh failed; keeping last known roster`,
        error,
      );
    }
  }
}

/**
 * Refuses to start while an obsolete roster env is populated.
 *
 * Ignoring it would be friendlier and worse: the operator keeps believing that
 * variable controls which tenants are served. An empty or unset value (a
 * docker-compose passthrough default) is not populated and is left alone.
 */
export function rejectObsoleteRosterEnv(name: string | undefined): void {
  if (name && process.env[name]) {
    throw new Error(
      `${name} is obsolete. The tenant roster now comes from ` +
        `chai.active_tenant_roster() and refreshes at runtime. Remove ${name} to ` +
        `avoid a stale second source of truth.`,
    );
  }
}
