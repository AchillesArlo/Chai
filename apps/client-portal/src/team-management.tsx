'use client';

import { useState } from 'react';
import { UserX, X } from 'lucide-react';
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

  const [revokingMember, setRevokingMember] = useState<MemberRow | null>(null);
  const [revokedIds, setRevokedIds] = useState<Set<string>>(new Set());

  const rows = memberships ?? [];
  const members = rows.filter((member) => member.status !== 'INVITED' && !revokedIds.has(member.id));
  const invitations = rows.filter((member) => member.status === 'INVITED');
  const activeCount = rows.filter((member) => member.status === 'ACTIVE' && !revokedIds.has(member.id)).length;

  const confirmRevoke = (member: MemberRow) => {
    setRevokedIds((prev) => new Set([...prev, member.id]));
    setRevokingMember(null);
  };

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
                  <div className="flex items-center gap-3">
                    <StatusBadge label={member.status} tone={statusTone[member.status]} />
                    {member.role !== 'CLIENT_OWNER' && (
                      <button
                        type="button"
                        onClick={() => setRevokingMember(member)}
                        className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition"
                      >
                        <UserX className="size-3" /> Revoke
                      </button>
                    )}
                  </div>
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

      {/* Revoke Member Confirmation Modal (REQ-03-035) */}
      {revokingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-red-600">Konfirmasi Pencabutan Akses Anggota</h3>
              <button
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setRevokingMember(null)}
                type="button"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Apakah Anda yakin ingin mencabut akses pengguna <strong className="text-slate-900">{revokingMember.userId}</strong>? Tindakan destruktif ini akan membatalkan seluruh hak akses tim.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setRevokingMember(null)}
                type="button"
              >
                Batal
              </button>
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                onClick={() => confirmRevoke(revokingMember)}
                type="button"
              >
                Konfirmasi Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
