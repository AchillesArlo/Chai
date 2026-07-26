'use client';

import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { useApiQuery } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export interface LeadItem {
  contactId: string;
  id: string;
  score: number;
  stage: string;
  status: string;
}

// Canonical pipeline order. Any stage the API returns that is not listed here
// is appended so a lead is never silently dropped from the board.
const STAGE_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON'];

function orderedStages(leads: LeadItem[]): string[] {
  const present = new Set(leads.map((lead) => lead.stage));
  const known = STAGE_ORDER.filter((stage) => present.has(stage));
  const extra = [...present].filter((stage) => !STAGE_ORDER.includes(stage)).sort();
  return [...known, ...extra];
}

export default function LeadPipelinePage() {
  const { data: leads, isLoading, error } = useApiQuery<LeadItem[]>(
    ['leads'],
    '/client/v1/leads',
  );

  const rows = leads ?? [];
  const averageScore = rows.length
    ? Math.round(rows.reduce((sum, lead) => sum + lead.score, 0) / rows.length)
    : 0;
  const wonCount = rows.filter((lead) => lead.stage === 'WON').length;
  const stages = orderedStages(rows);

  return (
    <AppShell
      currentPath="/leads"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Lead Pipeline & Deals"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard freshness="live" label="Total Leads" value={isLoading ? '—' : String(rows.length)} />
          <MetricCard freshness="live" label="Average Lead Score" value={isLoading ? '—' : `${averageScore} / 100`} />
          <MetricCard freshness="live" label="Deals Won" value={isLoading ? '—' : String(wonCount)} />
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Loading leads…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-red-600">
            Failed to load leads. {error.message}
          </div>
        ) : stages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No leads in the pipeline yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {stages.map((stage) => {
              const stageLeads = rows.filter((lead) => lead.stage === stage);
              return (
                <div key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">{stage}</h3>
                    <StatusBadge label={String(stageLeads.length)} tone="info" />
                  </div>
                  <div className="space-y-3">
                    {stageLeads.map((lead) => (
                      <div key={lead.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">{lead.contactId}</p>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                          <StatusBadge label={lead.status} tone="neutral" />
                          <span className="text-xs font-medium text-emerald-600">Score {lead.score}</span>
                        </div>
                      </div>
                    ))}
                    {stageLeads.length === 0 && (
                      <p className="py-4 text-center text-xs text-slate-400">No leads in stage</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
