'use client';

import { useEffect, useState } from 'react';

import { AppShell, Button, SavingIndicator, StatusBadge } from '@chai/ui';

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
 * Tenant Creation Wizard (03_UX_UI §5.5, REQ-03-009).
 *
 * Eight steps, the draft autosaves after every step, and the tenant is created
 * as DRAFT. It can only be activated once the onboarding checklist (§6.2)
 * passes — the wizard has no path that produces an ACTIVE tenant with an
 * incomplete checklist.
 */
export const WIZARD_DRAFT_STORAGE_KEY = 'chai-tenant-wizard-draft';

export const WIZARD_STEPS = [
  'Identitas',
  'Paket & entitlement',
  'Template vertikal',
  'Undang Client Owner',
  'Rencana kanal',
  'Kebijakan & budget AI',
  'Retensi data & consent',
  'Tinjau & buat draf',
] as const;

interface WizardData {
  aiBudget: string;
  channelPlan: string;
  consentDefault: boolean;
  legalId: string;
  locale: string;
  name: string;
  ownerInviteEmail: string;
  packageTier: string;
  retentionDays: string;
  timezone: string;
  vertical: string;
}

const INITIAL_DATA: WizardData = {
  aiBudget: '',
  channelPlan: '',
  consentDefault: true,
  legalId: '',
  locale: 'id-ID',
  name: '',
  ownerInviteEmail: '',
  packageTier: 'growth',
  retentionDays: '365',
  timezone: 'Asia/Jakarta',
  vertical: 'generic',
};

type CreatedStatus = 'DRAFT' | 'ACTIVE' | null;

function fieldLabelClass(): string {
  return 'block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1';
}

function textInputClass(): string {
  return 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
}

export function TenantWizard({
  storageKey = WIZARD_DRAFT_STORAGE_KEY,
}: {
  storageKey?: string;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [status, setStatus] = useState<CreatedStatus>(null);
  const [modules, setModules] = useState<OnboardingModules>(DEFAULT_ONBOARDING_MODULES);
  const [items, setItems] = useState<readonly OnboardingItem[]>(DEFAULT_ONBOARDING_ITEMS);

  // Load any previously autosaved draft on mount (client-only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setData({ ...INITIAL_DATA, ...(parsed as Partial<WizardData>) });
        }
      }
    } catch {
      // A corrupt draft must not block creating a new tenant; start clean.
    }
  }, [storageKey]);

  function persist(next: WizardData) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  }

  function updateField<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }

  function goTo(index: number) {
    persist(data);
    setStepIndex(Math.max(0, Math.min(WIZARD_STEPS.length - 1, index)));
  }

  function toggleModule(module: keyof OnboardingModules, enabled: boolean) {
    setModules((prev) => ({ ...prev, [module]: enabled }));
  }

  function toggleChecklistItem(id: string, done: boolean) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, done } : item)));
  }

  function createDraft() {
    persist(data);
    setStatus('DRAFT');
  }

  const complete = isOnboardingComplete(items, modules);

  function activate() {
    // Guard the invariant even if the button is somehow reachable: no ACTIVE
    // tenant without a complete checklist.
    if (!complete) return;
    setStatus('ACTIVE');
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Draft cleanup is best-effort.
    }
  }

  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;

  return (
    <AppShell
      currentPath="/tenants"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Wizard Pembuatan Tenant"
      surface="owner"
      tenantContext="All tenants"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-950">Buat tenant baru</h2>
          <SavingIndicator label="Menyimpan otomatis…" savedLabel="Tersimpan otomatis" state={saveState} />
        </div>

        <ol className="flex flex-wrap gap-2" aria-label="Langkah wizard">
          {WIZARD_STEPS.map((label, index) => (
            <li key={label}>
              <span
                aria-current={index === stepIndex ? 'step' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  index === stepIndex
                    ? 'bg-brand-600 text-white'
                    : index < stepIndex
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                <span className="tabular-nums">{index + 1}</span>
                {label}
              </span>
            </li>
          ))}
        </ol>

        <section
          aria-label={`Langkah ${stepIndex + 1}: ${WIZARD_STEPS[stepIndex]}`}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-950">{WIZARD_STEPS[stepIndex]}</h3>

          {stepIndex === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={fieldLabelClass()} htmlFor="w-name">
                  Nama organisasi *
                </label>
                <input
                  className={textInputClass()}
                  id="w-name"
                  onChange={(e) => updateField('name', e.target.value)}
                  value={data.name}
                />
              </div>
              <div>
                <label className={fieldLabelClass()} htmlFor="w-legal">
                  Identitas legal/bisnis
                </label>
                <input
                  className={textInputClass()}
                  id="w-legal"
                  onChange={(e) => updateField('legalId', e.target.value)}
                  value={data.legalId}
                />
              </div>
              <div>
                <label className={fieldLabelClass()} htmlFor="w-tz">
                  Zona waktu
                </label>
                <select
                  className={textInputClass()}
                  id="w-tz"
                  onChange={(e) => updateField('timezone', e.target.value)}
                  value={data.timezone}
                >
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Makassar">Asia/Makassar</option>
                  <option value="Asia/Jayapura">Asia/Jayapura</option>
                </select>
              </div>
              <div>
                <label className={fieldLabelClass()} htmlFor="w-locale">
                  Locale
                </label>
                <select
                  className={textInputClass()}
                  id="w-locale"
                  onChange={(e) => updateField('locale', e.target.value)}
                  value={data.locale}
                >
                  <option value="id-ID">id-ID</option>
                  <option value="en-US">en-US</option>
                </select>
              </div>
            </div>
          ) : null}

          {stepIndex === 1 ? (
            <div className="space-y-4">
              <div>
                <label className={fieldLabelClass()} htmlFor="w-package">
                  Paket
                </label>
                <select
                  className={textInputClass()}
                  id="w-package"
                  onChange={(e) => updateField('packageTier', e.target.value)}
                  value={data.packageTier}
                >
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="scale">Scale</option>
                </select>
              </div>
              <fieldset className="space-y-2">
                <legend className={fieldLabelClass()}>Modul opsional (default mati)</legend>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={modules.payment}
                    onChange={(e) => toggleModule('payment', e.target.checked)}
                    type="checkbox"
                  />
                  Pembayaran
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={modules.shipping}
                    onChange={(e) => toggleModule('shipping', e.target.checked)}
                    type="checkbox"
                  />
                  Logistik
                </label>
              </fieldset>
            </div>
          ) : null}

          {stepIndex === 2 ? (
            <div>
              <label className={fieldLabelClass()} htmlFor="w-vertical">
                Template vertikal
              </label>
              <select
                className={textInputClass()}
                id="w-vertical"
                onChange={(e) => updateField('vertical', e.target.value)}
                value={data.vertical}
              >
                <option value="generic">Umum</option>
                <option value="dental">Klinik gigi</option>
                <option value="retail">Ritel</option>
                <option value="logistics">Logistik</option>
              </select>
            </div>
          ) : null}

          {stepIndex === 3 ? (
            <div>
              <label className={fieldLabelClass()} htmlFor="w-invite">
                Email Client Owner
              </label>
              <input
                className={textInputClass()}
                id="w-invite"
                onChange={(e) => updateField('ownerInviteEmail', e.target.value)}
                type="email"
                value={data.ownerInviteEmail}
              />
              <p className="mt-2 text-xs text-slate-500">
                Undangan dikirim saat tenant diaktifkan; onboarding klien mengikuti §6.2.
              </p>
            </div>
          ) : null}

          {stepIndex === 4 ? (
            <div>
              <label className={fieldLabelClass()} htmlFor="w-channels">
                Rencana kanal
              </label>
              <textarea
                className={textInputClass()}
                id="w-channels"
                onChange={(e) => updateField('channelPlan', e.target.value)}
                rows={3}
                value={data.channelPlan}
              />
            </div>
          ) : null}

          {stepIndex === 5 ? (
            <div>
              <label className={fieldLabelClass()} htmlFor="w-budget">
                Budget AI bulanan (IDR)
              </label>
              <input
                className={textInputClass()}
                id="w-budget"
                inputMode="numeric"
                onChange={(e) => updateField('aiBudget', e.target.value)}
                value={data.aiBudget}
              />
            </div>
          ) : null}

          {stepIndex === 6 ? (
            <div className="space-y-4">
              <div>
                <label className={fieldLabelClass()} htmlFor="w-retention">
                  Retensi data (hari)
                </label>
                <input
                  className={textInputClass()}
                  id="w-retention"
                  inputMode="numeric"
                  onChange={(e) => updateField('retentionDays', e.target.value)}
                  value={data.retentionDays}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={data.consentDefault}
                  onChange={(e) => updateField('consentDefault', e.target.checked)}
                  type="checkbox"
                />
                Wajibkan consent default untuk pesan keluar
              </label>
            </div>
          ) : null}

          {stepIndex === 7 ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Nama</dt>
                <dd className="text-slate-900">{data.name || '—'}</dd>
                <dt className="text-slate-500">Paket</dt>
                <dd className="text-slate-900">{data.packageTier}</dd>
                <dt className="text-slate-500">Vertikal</dt>
                <dd className="text-slate-900">{data.vertical}</dd>
                <dt className="text-slate-500">Modul</dt>
                <dd className="text-slate-900">
                  {[modules.payment ? 'pembayaran' : null, modules.shipping ? 'logistik' : null]
                    .filter(Boolean)
                    .join(', ') || 'tidak ada'}
                </dd>
              </dl>

              {status === null ? (
                <Button onClick={createDraft} variant="primary">
                  Buat draf tenant
                </Button>
              ) : (
                <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Status tenant:</span>
                    <StatusBadge
                      label={status}
                      tone={status === 'ACTIVE' ? 'success' : 'neutral'}
                    />
                  </div>
                  <OnboardingChecklist
                    items={items}
                    modules={modules}
                    onToggle={toggleChecklistItem}
                  />
                  {status !== 'ACTIVE' ? (
                    <div className="space-y-1">
                      <Button disabled={!complete} onClick={activate} variant="primary">
                        Aktifkan tenant
                      </Button>
                      {!complete ? (
                        <p className="text-xs text-amber-700">
                          Selesaikan seluruh checklist onboarding sebelum mengaktifkan tenant.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-emerald-700">
                      Tenant aktif. Undangan Client Owner dikirim.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </section>

        <div className="flex items-center justify-between">
          <Button disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)} variant="secondary">
            Kembali
          </Button>
          {!isLastStep ? (
            <Button onClick={() => goTo(stepIndex + 1)} variant="primary">
              Lanjut
            </Button>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
