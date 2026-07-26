'use client';

import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from './config/navigation';

export function ReliabilityOverview() {
  return (
    <AppShell
      currentPath="/reliability"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Reliability"
      surface="owner"
      tenantContext="All tenants"
    >
      <section aria-labelledby="freshness-title" className="space-y-3">
        <h2 className="text-base font-semibold text-slate-950" id="freshness-title">
          Data freshness
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard freshness="Updated 1 minute ago" label="Webhook freshness" value="14s p95" />
          <MetricCard freshness="Updated 1 minute ago" label="Replay lag" value="3s p95" />
          <MetricCard freshness="Updated 2 minutes ago" label="Stale tenants" value="1" />
        </div>
      </section>

      <section aria-labelledby="incidents-title" className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-950" id="incidents-title">
            Open incidents
          </h2>
          <StatusBadge label="Stable" tone="success" />
        </div>
        <p className="text-sm text-slate-600">
          Platform reliability and per-tenant freshness surface here. Reconcile stale tenants before
          promoting any dashboard number.
        </p>
      </section>
    </AppShell>
  );
}
