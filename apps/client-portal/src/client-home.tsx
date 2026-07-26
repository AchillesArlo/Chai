'use client';

import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { CLIENT_PORTAL_NAVIGATION } from './config/navigation';

export function ClientHome() {
  return (
    <AppShell
      currentPath="/"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Good afternoon, Nusantara Dental"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <section
        aria-labelledby="outcomes-title"
        className="space-y-3"
      >
        <h2
          className="text-base font-semibold text-slate-950"
          id="outcomes-title"
        >
          Outcomes today
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            freshness="Updated 5 minutes ago"
            label="Successful outcomes"
            trend="+8.2%"
            value="128"
          />
          <MetricCard
            freshness="Updated 5 minutes ago"
            label="Human handovers"
            value="9"
          />
          <MetricCard
            freshness="Updated 5 minutes ago"
            label="AI used published knowledge"
            value="96%"
          />
        </div>
      </section>

      <section
        aria-labelledby="attention-title"
        className="mt-6 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-semibold text-slate-950"
            id="attention-title"
          >
            Needs your attention
          </h2>
          <StatusBadge label="3 open" tone="warning" />
        </div>
        <p className="text-sm text-slate-600">
          Conversations paused for your review or awaiting a decision.
        </p>
      </section>
    </AppShell>
  );
}

export function ClientLoginPanel({
  localAccessEnabled = false,
}: {
  localAccessEnabled?: boolean;
}) {
  return (
    <section className="mx-auto max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight text-slate-950">
        Sign in to your workspace
      </h1>
      <p className="text-sm text-slate-600">
        Client access is invite-only. Each member joins through a verified tenant invitation.
      </p>
      {localAccessEnabled ? (
        <button
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          type="button"
        >
          Use local client identity
        </button>
      ) : null}
    </section>
  );
}
