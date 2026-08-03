'use client';

import { useState } from 'react';
import { Building2, Mail } from 'lucide-react';

import {
  AppShell,
  Button,
  ChannelRiskBadge,
  CostBadge,
  StatusBadge,
  Tabs,
} from '@chai/ui';

import { OWNER_CONSOLE_NAVIGATION } from './config/navigation';
import {
  DEFAULT_ONBOARDING_ITEMS,
  DEFAULT_ONBOARDING_MODULES,
  OnboardingChecklist,
  isOnboardingComplete,
  type OnboardingItem,
  type OnboardingModules,
} from './onboarding-checklist';

/**
 * Tenant Detail (03_UX_UI §5.6, REQ-03-010).
 *
 * A persistent tenant identity banner sits above the tabs and stays on screen
 * while the owner works — cross-tenant navigation is where "acted on the wrong
 * tenant" incidents happen, so the banner is deliberately loud and always
 * present, independent of which tab is active.
 */
export type TenantStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'DELETION_REQUESTED';

export interface TenantDetailData {
  environment: 'production' | 'sandbox';
  id: string;
  name: string;
  package: string;
  slug: string;
  status: TenantStatus;
}

const MOCK_TENANTS: Record<string, TenantDetailData> = {
  'tenant-nusantara': {
    environment: 'production',
    id: 'tenant-nusantara',
    name: 'Nusantara Dental',
    package: 'growth',
    slug: 'nusantara-dental',
    status: 'ACTIVE',
  },
  'tenant-surya': {
    environment: 'production',
    id: 'tenant-surya',
    name: 'Surya Logistics',
    package: 'scale',
    slug: 'surya-logistics',
    status: 'ACTIVE',
  },
};

export function lookupTenant(id: string): TenantDetailData {
  return (
    MOCK_TENANTS[id] ?? {
      environment: 'sandbox',
      id,
      name: id,
      package: 'growth',
      slug: id,
      status: 'DRAFT',
    }
  );
}

const STATUS_TONE: Record<TenantStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  DELETION_REQUESTED: 'danger',
  DRAFT: 'neutral',
  SUSPENDED: 'warning',
};

function TenantIdentityBanner({ tenant }: { tenant: TenantDetailData }) {
  return (
    <div
      aria-label="Identitas tenant aktif"
      className="sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5"
      role="region"
    >
      <Building2 aria-hidden="true" className="size-5 text-amber-700" />
      <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Sedang melihat tenant
      </span>
      <span className="text-sm font-semibold text-amber-950">{tenant.name}</span>
      <span className="font-mono text-xs text-amber-800">{tenant.slug}</span>
      <StatusBadge label={tenant.status} tone={STATUS_TONE[tenant.status]} />
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-amber-900">
        {tenant.environment}
      </span>
    </div>
  );
}

function OverviewTab({ tenant }: { tenant: TenantDetailData }) {
  const [items, setItems] = useState<readonly OnboardingItem[]>(DEFAULT_ONBOARDING_ITEMS);
  const [modules] = useState<OnboardingModules>(DEFAULT_ONBOARDING_MODULES);
  const complete = isOnboardingComplete(items, modules);
  const [status, setStatus] = useState<TenantStatus>(tenant.status);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="text-slate-500">Paket</p>
          <p className="font-medium text-slate-900">{tenant.package}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="text-slate-500">Status</p>
          <StatusBadge label={status} tone={STATUS_TONE[status]} />
        </div>
      </div>
      <OnboardingChecklist
        items={items}
        modules={modules}
        onToggle={(id, done) =>
          setItems((prev) => prev.map((item) => (item.id === id ? { ...item, done } : item)))
        }
      />
      {status !== 'ACTIVE' ? (
        <div className="space-y-1">
          <Button disabled={!complete} onClick={() => complete && setStatus('ACTIVE')} variant="primary">
            Aktifkan tenant
          </Button>
          {!complete ? (
            <p className="text-xs text-amber-700">
              Tenant tetap DRAFT hingga checklist onboarding lengkap.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-medium text-emerald-700">Tenant aktif.</p>
      )}
    </div>
  );
}

function UsersTab() {
  const [email, setEmail] = useState('');
  const [invited, setInvited] = useState<string[]>([]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Undang Client Owner atau anggota tim. Undangan mengikuti alur onboarding §6.2.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          setInvited((prev) => [...prev, email.trim()]);
          setEmail('');
        }}
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1" htmlFor="invite-email">
            Email undangan
          </label>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            id="invite-email"
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            value={email}
          />
        </div>
        <Button leadingIcon={<Mail className="size-4" />} type="submit" variant="primary">
          Kirim undangan
        </Button>
      </form>
      {invited.length > 0 ? (
        <ul className="text-sm text-slate-700">
          {invited.map((e) => (
            <li key={e}>Undangan terkirim: {e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChannelsTab() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <span className="font-medium text-slate-900">WhatsApp (Meta Direct)</span>
        <ChannelRiskBadge risk="official" />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <span className="font-medium text-slate-900">Community Gateway (WAHA)</span>
        <ChannelRiskBadge risk="community" />
      </div>
    </div>
  );
}

function UsageTab() {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-slate-600">Biaya token AI (bulan berjalan)</dt>
        <dd>
          <CostBadge amountMinor={4200000} currency="IDR" source="measured" />
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-slate-600">Proyeksi akhir bulan</dt>
        <dd>
          <CostBadge amountMinor={6800000} currency="IDR" source="estimated" />
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-slate-600">Tagihan provider terekonsiliasi</dt>
        <dd>
          <CostBadge amountMinor={3950000} currency="IDR" source="reconciled" />
        </dd>
      </div>
    </dl>
  );
}

export function TenantDetail({ tenantId }: { tenantId: string }) {
  const tenant = lookupTenant(tenantId);
  return (
    <AppShell
      currentPath="/tenants"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle={`Tenant: ${tenant.name}`}
      surface="owner"
      tenantContext={tenant.name}
    >
      <TenantIdentityBanner tenant={tenant} />
      <Tabs
        items={[
          { content: <OverviewTab tenant={tenant} />, label: 'Overview' },
          { content: <UsersTab />, label: 'Users' },
          { content: <ChannelsTab />, label: 'Channels' },
          { content: <p className="text-sm text-slate-600">Provider, model, dan pengetahuan tenant.</p>, label: 'AI & Knowledge' },
          { content: <p className="text-sm text-slate-600">Kapabilitas modul (default mati).</p>, label: 'Features' },
          { content: <UsageTab />, label: 'Usage' },
          { content: <p className="text-sm text-slate-600">Jejak audit lintas-tenant.</p>, label: 'Audit' },
          { content: <p className="text-sm text-slate-600">Retensi & consent.</p>, label: 'Data policy' },
        ]}
      />
    </AppShell>
  );
}
