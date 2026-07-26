import { describe, expect, it, vi } from 'vitest';

import type { Database } from './client';
import { rejectObsoleteRosterEnv, runWithTenantRoster } from './tenant-roster-loop';

/**
 * Worker roster loop regression.
 *
 * Every worker depends on these three behaviours, and each one is a production
 * incident when wrong: a worker that starts with an empty roster looks healthy
 * while delivering nothing, a worker that dies on a transient refresh failure
 * stops delivering entirely, and a leftover env roster is a silent second source
 * of truth.
 */
type RosterRow = { principal_id: string; tenant_id: string };

const TENANT_A = '01890f47-9b3c-7cc2-98e8-1234567890a1';
const PRINCIPAL = '01890f47-9b3c-7cc2-98e8-1234567890b1';

/**
 * Minimal stand-in for the tagged-template database handle: only the roster
 * query is exercised, so faking the call shape is enough and keeps this a fast
 * unit test rather than another container start.
 */
function fakeDatabase(responses: Array<RosterRow[] | Error>): Database {
  let call = 0;
  const handle = (async () => {
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as Database;
  return handle;
}

const oneTenant: RosterRow[] = [{ principal_id: PRINCIPAL, tenant_id: TENANT_A }];

describe('runWithTenantRoster', () => {
  it('fails hard when the first roster read fails', async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => undefined);

    await expect(
      runWithTenantRoster({
        database: fakeDatabase([new Error('database unreachable')]),
        name: 'test-worker',
        run,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/database unreachable/);

    // Starting with no tenants at all is a silent no-op, so no work may run.
    expect(run).not.toHaveBeenCalled();
  });

  it('passes the live roster to the work window', async () => {
    const controller = new AbortController();
    const seen: string[] = [];

    await runWithTenantRoster({
      database: fakeDatabase([oneTenant]),
      name: 'test-worker',
      refreshMs: 10,
      run: async ({ tenants }) => {
        seen.push(...tenants.map((tenant) => tenant.tenantId));
        controller.abort();
      },
      signal: controller.signal,
    });

    expect(seen).toEqual([TENANT_A]);
  });

  it('keeps the last known roster when a refresh fails', async () => {
    const controller = new AbortController();
    const windows: number[] = [];
    const errors: unknown[] = [];
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        errors.push(args);
      });

    try {
      await runWithTenantRoster({
        // First read succeeds, every later read fails.
        database: fakeDatabase([oneTenant, new Error('refresh failed')]),
        name: 'test-worker',
        refreshMs: 5,
        run: async ({ tenants }) => {
          windows.push(tenants.length);
          // Stop after the second window, which only happens if the failed
          // refresh did not take the loop down.
          if (windows.length >= 2) controller.abort();
        },
        signal: controller.signal,
      });
    } finally {
      consoleError.mockRestore();
    }

    expect(windows).toEqual([1, 1]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('ends the window when shutdown is signalled', async () => {
    const controller = new AbortController();
    let windowAborted = false;

    await runWithTenantRoster({
      database: fakeDatabase([oneTenant]),
      name: 'test-worker',
      // A long refresh window must not delay shutdown.
      refreshMs: 60_000,
      run: async ({ signal }) => {
        controller.abort();
        windowAborted = signal.aborted;
      },
      signal: controller.signal,
    });

    expect(windowAborted).toBe(true);
  });
});

describe('rejectObsoleteRosterEnv', () => {
  it('refuses to start while an obsolete roster env is populated', () => {
    vi.stubEnv('CHAI_TEST_OBSOLETE_ROSTER', 'tenant:principal');
    try {
      expect(() => rejectObsoleteRosterEnv('CHAI_TEST_OBSOLETE_ROSTER')).toThrow(
        /obsolete/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('treats an empty value as not populated', () => {
    // docker-compose passes an empty string for unset variables; that is not an
    // operator asserting a roster.
    vi.stubEnv('CHAI_TEST_OBSOLETE_ROSTER', '');
    try {
      expect(() => rejectObsoleteRosterEnv('CHAI_TEST_OBSOLETE_ROSTER')).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
