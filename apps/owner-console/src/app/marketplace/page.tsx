'use client';

import { useState } from 'react';
import {
  Globe,
  Key,
  MessageSquare,
  Power,
  Send,
  ShoppingBag,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import { AppShell } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from '../../config/navigation';

export interface ProviderItem {
  id: string;
  name: string;
  category: 'CHANNEL' | 'PAYMENT' | 'LOGISTICS';
  description: string;
  icon: LucideIcon;
  status: 'ACTIVE' | 'STANDBY';
  killSwitch: 'NORMAL' | 'DEGRADED' | 'SHUTDOWN';
  activeTenantsCount: number;
}

const INITIAL_PROVIDERS: ProviderItem[] = [
  {
    id: 'whatsapp-meta',
    name: 'WhatsApp Business API (Meta Cloud)',
    category: 'CHANNEL',
    description: 'Official Meta Graph API v20.0 for WhatsApp Messaging & Templates',
    icon: MessageSquare,
    status: 'ACTIVE',
    killSwitch: 'NORMAL',
    activeTenantsCount: 14,
  },
  {
    id: 'telegram-bot',
    name: 'Telegram Bot API',
    category: 'CHANNEL',
    description: 'Instant Messaging & Notification Bot via Telegram Bot API',
    icon: Send,
    status: 'ACTIVE',
    killSwitch: 'NORMAL',
    activeTenantsCount: 10,
  },
  {
    id: 'web-widget',
    name: 'Embedded Web Chat Widget',
    category: 'CHANNEL',
    description: 'Customizable script tag chat widget for client websites',
    icon: Globe,
    status: 'ACTIVE',
    killSwitch: 'NORMAL',
    activeTenantsCount: 14,
  },
  {
    id: 'midtrans-payment',
    name: 'Midtrans Payment Gateway',
    category: 'PAYMENT',
    description: 'Snap & Core API for QRIS, Bank Transfer, & E-Wallets in Indonesia',
    icon: ShoppingBag,
    status: 'ACTIVE',
    killSwitch: 'NORMAL',
    activeTenantsCount: 12,
  },
  {
    id: 'stripe-billing',
    name: 'Stripe Global Payments',
    category: 'PAYMENT',
    description: 'International credit card & subscription billing connector',
    icon: Key,
    status: 'ACTIVE',
    killSwitch: 'NORMAL',
    activeTenantsCount: 4,
  },
  {
    id: 'jne-logistics',
    name: 'JNE Express Logistics',
    category: 'LOGISTICS',
    description: 'Automated airway bill (AWB) generation & real-time tracking',
    icon: Truck,
    status: 'ACTIVE',
    killSwitch: 'NORMAL',
    activeTenantsCount: 8,
  },
  {
    id: 'biteship-multi-courier',
    name: 'Biteship Multi-Courier Integrator',
    category: 'LOGISTICS',
    description: 'Aggregated shipping rates & pickup dispatch for J&T, SiCepat, GoSend',
    icon: Truck,
    status: 'ACTIVE',
    killSwitch: 'NORMAL',
    activeTenantsCount: 9,
  },
];

export default function MarketplacePage() {
  const [providers, setProviders] = useState<ProviderItem[]>(INITIAL_PROVIDERS);
  const [selectedProvider, setSelectedProvider] = useState<ProviderItem | null>(null);

  const toggleKillSwitch = (providerId: string) => {
    setProviders((prev) =>
      prev.map((p) => {
        if (p.id !== providerId) return p;
        const nextState: Record<'NORMAL' | 'DEGRADED' | 'SHUTDOWN', 'NORMAL' | 'DEGRADED' | 'SHUTDOWN'> = {
          NORMAL: 'DEGRADED',
          DEGRADED: 'SHUTDOWN',
          SHUTDOWN: 'NORMAL',
        };
        const nextKillSwitch = nextState[p.killSwitch];
        return { ...p, killSwitch: nextKillSwitch };
      })
    );
  };

  return (
    <AppShell
      currentPath="/marketplace"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Connector Marketplace & Provider Kill Switch"
      surface="owner"
      tenantContext="Platform Owner"
    >
      <div className="space-y-6 max-w-6xl">
        {/* Header summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Global Communication & Provider Connectors</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage API connections, Meta OAuth endpoints, and platform-wide 3-tier circuit breaker kill switches.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              7 Active Connectors
            </span>
          </div>
        </div>

        {/* Connectors Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => {
            const Icon = p.icon;
            const killSwitchColor =
              p.killSwitch === 'NORMAL'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : p.killSwitch === 'DEGRADED'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-rose-50 text-rose-700 border-rose-200';

            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="size-5" />
                    </div>
                    <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${killSwitchColor}`}>
                      KILL-SWITCH: {p.killSwitch}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-950 mt-3">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                </div>

                <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">{p.activeTenantsCount} Tenants Connected</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleKillSwitch(p.id)}
                      className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                      title="Toggle 3-Tier Kill Switch (NORMAL -> DEGRADED -> SHUTDOWN)"
                    >
                      <Power className="size-3 text-rose-600" /> Switch Status
                    </button>
                    <button
                      onClick={() => setSelectedProvider(p)}
                      className="rounded bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
                    >
                      Config
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Configuration Modal */}
        {selectedProvider && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-semibold text-slate-950">{selectedProvider.name} Config</h3>
                <button onClick={() => setSelectedProvider(null)} className="text-slate-400 hover:text-slate-600 text-xs">Close</button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700">Meta / Provider App Client ID</label>
                  <input type="text" defaultValue="meta_app_9182371928" className="mt-1 w-full rounded border p-2 font-mono" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Meta / Provider App Secret</label>
                  <input type="password" defaultValue="sec_meta_891237198237" className="mt-1 w-full rounded border p-2 font-mono" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Global Webhook Ingress Endpoint</label>
                  <input type="text" readOnly value={`http://localhost:3001/api/v1/channels/${selectedProvider.id}/webhook`} className="mt-1 w-full rounded border bg-slate-50 p-2 font-mono text-slate-600" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button onClick={() => setSelectedProvider(null)} className="rounded border px-4 py-1.5 text-xs">Cancel</button>
                <button onClick={() => { alert('Provider credentials saved successfully!'); setSelectedProvider(null); }} className="rounded bg-brand-600 px-4 py-1.5 text-xs text-white font-semibold">Save Global Credentials</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
