'use client';

import { Check } from 'lucide-react';

/**
 * Tenant onboarding checklist (03_UX_UI §6.2, REQ-03-018).
 *
 * A tenant must not go ACTIVE until this checklist passes (§5.5). Payment and
 * shipping items only apply when the tenant enables those optional modules —
 * core onboarding must complete with every optional module off, per the
 * "capabilities default off" invariant.
 */
export interface OnboardingItem {
  done: boolean;
  id: string;
  label: string;
  module?: 'payment' | 'shipping';
}

export interface OnboardingModules {
  payment: boolean;
  shipping: boolean;
}

export const DEFAULT_ONBOARDING_MODULES: OnboardingModules = {
  payment: false,
  shipping: false,
};

export const DEFAULT_ONBOARDING_ITEMS: readonly OnboardingItem[] = [
  { done: false, id: 'business-profile', label: 'Profil bisnis' },
  { done: false, id: 'support-contacts', label: 'Kontak dukungan & eskalasi' },
  { done: false, id: 'business-hours', label: 'Jam operasional & hari libur' },
  { done: false, id: 'channel-connected', label: 'Kanal terhubung' },
  { done: false, id: 'knowledge-published', label: 'Pengetahuan diterbitkan' },
  { done: false, id: 'ai-scenarios', label: 'Skenario uji AI lulus' },
  { done: false, id: 'inbox-team', label: 'Tim inbox manusia ditugaskan' },
  { done: false, id: 'consent-templates', label: 'Pengaturan consent & template' },
  { done: false, id: 'dashboard-timezone', label: 'Zona waktu dasbor' },
  {
    done: false,
    id: 'payment-merchant',
    label: 'Merchant/provider pembayaran, sumber kebenaran & uji rekonsiliasi',
    module: 'payment',
  },
  {
    done: false,
    id: 'shipping-provider',
    label: 'Provider pengiriman, pemetaan tracking, notifikasi & pemilik eksepsi',
    module: 'shipping',
  },
  { done: false, id: 'go-live-approval', label: 'Persetujuan go-live' },
];

/** Items that apply given the tenant's enabled optional modules. */
export function applicableOnboardingItems(
  items: readonly OnboardingItem[],
  modules: OnboardingModules,
): OnboardingItem[] {
  return items.filter((item) => !item.module || modules[item.module]);
}

/** Onboarding passes only when every applicable item is done. */
export function isOnboardingComplete(
  items: readonly OnboardingItem[],
  modules: OnboardingModules,
): boolean {
  const applicable = applicableOnboardingItems(items, modules);
  return applicable.length > 0 && applicable.every((item) => item.done);
}

export interface OnboardingChecklistProps {
  items: readonly OnboardingItem[];
  modules: OnboardingModules;
  onToggle?: (id: string, done: boolean) => void;
  readOnly?: boolean;
}

export function OnboardingChecklist({
  items,
  modules,
  onToggle,
  readOnly = false,
}: OnboardingChecklistProps) {
  const applicable = applicableOnboardingItems(items, modules);
  const doneCount = applicable.filter((item) => item.done).length;
  const complete = isOnboardingComplete(items, modules);

  return (
    <section aria-label="Checklist onboarding tenant" className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-950">Checklist onboarding</p>
        <p
          className={`text-xs font-medium ${complete ? 'text-emerald-700' : 'text-slate-500'}`}
          data-onboarding-complete={complete}
        >
          {doneCount} dari {applicable.length} selesai
        </p>
      </div>
      <ul className="space-y-1">
        {applicable.map((item) => (
          <li key={item.id}>
            <label className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <input
                checked={item.done}
                className="size-4 rounded border-slate-300 text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                disabled={readOnly}
                onChange={(event) => onToggle?.(item.id, event.target.checked)}
                type="checkbox"
              />
              <span className={item.done ? 'text-slate-500 line-through' : ''}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
          complete
            ? 'bg-emerald-50 text-emerald-800'
            : 'bg-amber-50 text-amber-800'
        }`}
        role="status"
      >
        {complete ? <Check aria-hidden="true" className="size-3.5" /> : null}
        {complete
          ? 'Checklist lengkap — tenant boleh diaktifkan.'
          : 'Checklist belum lengkap — tenant tetap DRAFT dan tidak bisa diaktifkan.'}
      </p>
    </section>
  );
}
