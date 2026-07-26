'use client';

import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { useApiQuery } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from './config/navigation';

export interface MemberRow {
  id: string;
  role: 'CLIENT_OWNER' | 'CLIENT_MANAGER' | 'CLIENT_AGENT';
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REVOKED';
  userId: string;
}

const statusTone: Record<MemberRow['status'], 'success' | 'info' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INVITED: 'info',
  SUSPENDED: 'warning',
  REVOKED: 'danger',
};

export function TeamManagement() {
  const { data: memberships, isLoading, error } = useApiQuery<MemberRow[]>(
    ['team'],
    '/client/v1/team',
  );

  const rows = memberships ?? [];
  const members = rows.filter((member) => member.status !== 'INVITED');
  const invitations = rows.filter((member) => member.status === 'INVITED');
  const activeCount = rows.filter((member) => member.status === 'ACTIVE').length;

  return (
    <AppShell
      currentPath="/team"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Team & roles"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <section aria-labelledby="members-title" className="space-y-3">
        <h2 className="text-base font-semibold text-slate-950" id="members-title">
          Members
        </h2>
        <MetricCard freshness="live" label="Active members" value={isLoading ? '—' : String(activeCount)} />
        {isLoading ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Loading team…
          </p>
        ) : error ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-red-600">
            Failed to load team. {error.message}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-xs">
            {members.length === 0 ? (
              <li className="p-4 text-center text-sm text-slate-500">No active members.</li>
            ) : (
              members.map((member) => (
                <li className="flex flex-wrap items-center justify-between gap-4 px-4 py-3" key={member.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{member.userId}</p>
                    <p className="font-mono text-xs uppercase tracking-wide text-slate-500">{member.role}</p>
                  </div>
                  <StatusBadge label={member.status} tone={statusTone[member.status]} />
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="invitations-title" className="mt-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-950" id="invitations-title">
          Pending invitations
        </h2>
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-xs">
          {invitations.length === 0 ? (
            <li className="p-4 text-center text-sm text-slate-500">No pending invitations.</li>
          ) : (
            invitations.map((invitation) => (
              <li className="flex items-center justify-between gap-4 px-4 py-3" key={invitation.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950">{invitation.userId}</p>
                  <p className="font-mono text-xs uppercase tracking-wide text-slate-500">{invitation.role}</p>
                </div>
                <StatusBadge label="Pending" tone="info" />
              </li>
            ))
          )}
        </ul>
      </section>
    </AppShell>
  );
}
