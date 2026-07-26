'use client';

import { useState } from 'react';
import { CheckCircle, Plus, X } from 'lucide-react';

import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from './config/navigation';

export interface TenantRow {
  id: string;
  name: string;
  riskFlag?: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DRAFT' | 'DELETION_REQUESTED';
  updatedAt: string;
}

const INITIAL_TENANTS: TenantRow[] = [
  {
    id: 'tenant-nusantara',
    name: 'Nusantara Dental',
    slug: 'nusantara-dental',
    status: 'ACTIVE',
    updatedAt: 'Updated 2 minutes ago',
  },
  {
    id: 'tenant-surya',
    name: 'Surya Logistics',
    riskFlag: 'Webhook freshness drifting',
    slug: 'surya-logistics',
    status: 'ACTIVE',
    updatedAt: 'Updated 6 minutes ago',
  },
];

const statusTone = {
  ACTIVE: 'success',
  DELETION_REQUESTED: 'danger',
  DRAFT: 'neutral',
  SUSPENDED: 'warning',
} as const;

export function TenantsOverview() {
  const [tenants, setTenants] = useState<TenantRow[]>(INITIAL_TENANTS);
  const [selectedTenant, setSelectedTenant] = useState<string>('All tenants');
  const [showModal, setShowModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [slugInput, setSlugInput] = useState('');

  const filteredTenants = selectedTenant === 'All tenants'
    ? tenants
    : tenants.filter((t) => t.name === selectedTenant || t.slug.includes(selectedTenant.toLowerCase()));

  const activeCount = tenants.filter((t) => t.status === 'ACTIVE').length;
  const suspendedCount = tenants.filter((t) => t.status === 'SUSPENDED').length;

  const handleProvisionTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const slug = slugInput.trim() || nameInput.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newTenant: TenantRow = {
      id: `tenant-${Date.now()}`,
      name: nameInput.trim(),
      slug,
      status: 'ACTIVE',
      updatedAt: 'Just now',
    };

    setTenants((prev) => [newTenant, ...prev]);
    setShowModal(false);
    setNameInput('');
    setSlugInput('');
  };

  const handleToggleTenantStatus = (id: string) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextStatus = t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
          return { ...t, status: nextStatus, updatedAt: 'Just now' };
        }
        return t;
      })
    );
  };

  const handleTriageRisk = (id: string) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, riskFlag: undefined } : t))
    );
  };

  return (
    <AppShell
      currentPath="/tenants"
      navigation={OWNER_CONSOLE_NAVIGATION}
      onTenantChange={(t) => setSelectedTenant(t)}
      pageTitle={selectedTenant === 'All tenants' ? 'Tenant Directory' : `Tenant Scoped View: ${selectedTenant}`}
      surface="owner"
      tenantContext={selectedTenant}
    >
      <section aria-labelledby="directory-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950" id="directory-title">
            Tenant directory
          </h2>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
            onClick={() => setShowModal(true)}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Provision New Tenant
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            freshness="Updated 1 minute ago"
            label="Total tenants"
            value={`${tenants.length}`}
          />
          <MetricCard
            freshness="Updated 1 minute ago"
            label="Active tenants"
            value={`${activeCount}`}
          />
          <MetricCard
            freshness="Updated 3 minutes ago"
            label="Suspended tenants"
            value={`${suspendedCount}`}
          />
        </div>

        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-xs">
          {filteredTenants.map((tenant) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
              key={tenant.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-950">
                  {tenant.name}
                </p>
                <p className="font-mono text-xs text-slate-500">{tenant.slug}</p>
                <p className="mt-1 text-xs text-slate-500">{tenant.updatedAt}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge label={tenant.status} tone={statusTone[tenant.status]} />
                <button
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border transition ${
                    tenant.status === 'ACTIVE'
                      ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
                      : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                  onClick={() => handleToggleTenantStatus(tenant.id)}
                  type="button"
                >
                  {tenant.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="risk-title" className="mt-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-950" id="risk-title">
          Risk flags
        </h2>
        <p className="text-sm text-slate-600">
          Tenants approaching channel limits or showing degraded freshness are surfaced here for triage.
        </p>
        <ul className="space-y-2">
          {tenants.filter((tenant) => tenant.riskFlag).length === 0 ? (
            <li className="p-4 text-center text-xs text-slate-500 rounded-lg border border-slate-200 bg-white">
              No active risk flags detected across tenants.
            </li>
          ) : (
            tenants
              .filter((tenant) => tenant.riskFlag)
              .map((tenant) => (
                <li
                  className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                  key={tenant.id}
                >
                  <div>
                    <p className="text-sm font-medium text-amber-950">{tenant.name}</p>
                    <p className="text-xs text-amber-800">{tenant.riskFlag}</p>
                  </div>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition"
                    onClick={() => handleTriageRisk(tenant.id)}
                    type="button"
                  >
                    <CheckCircle aria-hidden="true" className="size-3.5" />
                    Triage Risk
                  </button>
                </li>
              ))
          )}
        </ul>
      </section>

      {/* Provision Tenant Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-950">Provision New Tenant</h3>
              <button
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setShowModal(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleProvisionTenant}>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1" htmlFor="tenant-name">
                  Tenant Organization Name *
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  id="tenant-name"
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Acme Health"
                  required
                  type="text"
                  value={nameInput}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1" htmlFor="tenant-slug">
                  Slug (URL identifier)
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  id="tenant-slug"
                  onChange={(e) => setSlugInput(e.target.value)}
                  placeholder="e.g. acme-health"
                  type="text"
                  value={slugInput}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  type="submit"
                >
                  Provision Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
