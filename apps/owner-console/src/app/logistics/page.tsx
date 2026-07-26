'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from '../../config/navigation';

interface ReturnRequest {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
}

interface Claim {
  id: string;
  category: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

const RETURN_STATUS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
};

const CLAIM_STATUS: Record<string, string> = {
  OPEN: 'bg-amber-50 text-amber-700',
  INVESTIGATING: 'bg-blue-50 text-blue-700',
  RESOLVED: 'bg-emerald-50 text-emerald-700',
};

export default function LogisticsPage() {
  const [returns] = useState<ReturnRequest[]>([]);
  const [claims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production these would hit the API
    setLoading(false);
  }, []);

  return (
    <AppShell
      currentPath="/logistics"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Logistics & Delivery Health"
      surface="owner"
      tenantContext="Platform Owner"
    >
      <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Advanced Logistics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rate shopping, return requests, claims, and ETA predictions.
        </p>
      </div>

      {/* Returns */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Return Requests</h2>
        {loading ? (
          <div className="text-sm text-gray-400">Loading returns…</div>
        ) : returns.length === 0 ? (
          <div className="rounded border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            No return requests yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {returns.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{r.id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-gray-700">{r.reason}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${RETURN_STATUS[r.status] ?? ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Claims */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Claims</h2>
        {loading ? (
          <div className="text-sm text-gray-400">Loading claims…</div>
        ) : claims.length === 0 ? (
          <div className="rounded border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            No claims filed yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{c.id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-gray-700">{c.category}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {(c.amountCents / 100).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${CLAIM_STATUS[c.status] ?? ''}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </AppShell>
  );
}
