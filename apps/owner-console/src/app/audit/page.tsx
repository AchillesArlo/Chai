'use client';

import { useState } from 'react';
import { Search, Lock } from 'lucide-react';
import { AppShell, StatusBadge } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from '../../config/navigation';

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  tenantId: string;
  resource: string;
  hashStatus: 'VERIFIED' | 'PENDING';
}

const SAMPLE_LOGS: AuditEntry[] = [
  { id: 'log-101', timestamp: '2026-07-23 16:20:12', actor: 'owner@chai-platform.com', action: 'TENANT_PROVISION', tenantId: 'tenant-nusantara-dental', resource: 'TenantConfig', hashStatus: 'VERIFIED' },
  { id: 'log-102', timestamp: '2026-07-23 15:45:00', actor: 'system@chai', action: 'CONNECTOR_KILLS_WITCH_TOGGLE', tenantId: 'global', resource: 'MidtransAdapter', hashStatus: 'VERIFIED' },
  { id: 'log-103', timestamp: '2026-07-23 14:10:33', actor: 'admin@nusantaradental.id', action: 'API_KEY_ROTATE', tenantId: 'tenant-nusantara-dental', resource: 'AuthCredential', hashStatus: 'VERIFIED' },
];

export default function AuditPage() {
  const [logs] = useState<AuditEntry[]>(SAMPLE_LOGS);

  return (
    <AppShell
      currentPath="/audit"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Immutability Audit Log Viewer"
      surface="owner"
      tenantContext="Platform Owner"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Cryptographic Immumtability Enabled</h2>
              <p className="text-xs text-slate-500">Every audit log entry is chained with SHA-256 HMAC for tamper-evidence.</p>
            </div>
          </div>
          <StatusBadge label="RLS & AUDIT CERTIFIED" tone="success" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-base font-semibold text-slate-950">Audit Entries</h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Filter logs..." className="rounded-md border border-slate-200 pl-8 pr-3 py-1 text-sm" />
            </div>
          </div>

          <ul className="divide-y divide-slate-200">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">{log.timestamp}</span>
                    <span className="text-xs font-bold text-brand-700">{log.action}</span>
                    <span className="text-xs text-slate-400">({log.tenantId})</span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1">Actor: {log.actor} • Resource: {log.resource}</p>
                </div>
                <StatusBadge label={log.hashStatus} tone="success" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
