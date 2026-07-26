'use client';

import { Save } from 'lucide-react';
import { AppShell } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from '../../config/navigation';

export default function OwnerSettingsPage() {
  return (
    <AppShell
      currentPath="/settings"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Super Admin Platform Settings"
      surface="owner"
      tenantContext="Platform Owner"
    >
      <div className="space-y-6 max-w-4xl">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950 mb-4">Platform Governance</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Platform Super Admin Email</label>
              <input type="email" defaultValue="admin@chai-platform.com" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Default Tenant Rate Limit (req/min)</label>
              <input type="number" defaultValue={500} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <button className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
              <Save className="h-4 w-4" /> Save Platform Config
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
