'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from '../../config/navigation';

import type { AutomationFlow } from '../../types/automation';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};

export default function AutomationPage() {
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/client/v1/automation/flows')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AutomationFlow[]) => setFlows(data))
      .catch(() => setFlows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell
      currentPath="/automation"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Automation & Workflow Engine"
      surface="owner"
      tenantContext="Platform Owner"
    >
      <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Automation Flows</h1>
          <p className="text-sm text-gray-500">Design, simulate, and publish automation flows.</p>
        </div>
        <Link
          href="/automation/builder"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New Flow
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading flows…</div>
      ) : flows.length === 0 ? (
        <div className="rounded border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          No flows yet. Click “New Flow” to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Version</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {flows.map((flow) => (
                <tr key={flow.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{flow.name}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[flow.status] ?? ''}`}>
                      {flow.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">v{flow.version}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(flow.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/automation/builder?id=${flow.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </AppShell>
  );
}
