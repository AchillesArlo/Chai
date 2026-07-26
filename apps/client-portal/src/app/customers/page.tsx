'use client';

import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { useApiQuery } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  segment: 'VIP' | 'REGULAR' | 'NEW';
  totalOrders: number;
  lifetimeValue: string;
  lastInteraction: string;
}

export default function CustomersPage() {
  const pathname = usePathname();
  const { data: customers, isLoading, error } = useApiQuery<CustomerProfile[]>(
    ['customers'],
    '/client/v1/contact-segments',
  );

  const vipCount = customers?.filter((c) => c.segment === 'VIP').length ?? 0;
  const newCount = customers?.filter((c) => c.segment === 'NEW').length ?? 0;

  return (
    <AppShell
      currentPath={pathname}
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Customers"
      surface="client"
      tenantContext="Demo Tenant"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customers..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard freshness="live" label="Total Customers" value={isLoading ? '—' : String(customers?.length ?? 0)} />
          <MetricCard freshness="live" label="VIP Segment" value={String(vipCount)} />
          <MetricCard freshness="live" label="New This Month" value={String(newCount)} />
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-sm font-semibold text-slate-900">Customer Directory</h3>
          </div>
          {isLoading ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">Loading customers…</div>
          ) : error ? (
            <div className="px-6 py-12 text-center text-sm text-red-600">Failed to load customers. {error.message}</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {(customers ?? []).map((cust) => (
                <li key={cust.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-600">
                      {cust.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{cust.name}</p>
                        <StatusBadge label={cust.segment} tone={cust.segment === 'VIP' ? 'success' : 'info'} />
                      </div>
                      <p className="text-xs text-slate-500">{cust.phone} • {cust.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{cust.lifetimeValue}</p>
                    <p className="text-xs text-slate-500">{cust.totalOrders} orders • Last active {cust.lastInteraction}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}