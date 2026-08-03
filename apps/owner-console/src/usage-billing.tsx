'use client';

import { AppShell, CostBadge, type CostSource } from '@chai/ui';

import { OWNER_CONSOLE_NAVIGATION } from './config/navigation';

/**
 * Usage & Billing (03_UX_UI, REQ-03-014).
 *
 * Every money figure is rendered through CostBadge, which forces a source label
 * (`measured` / `estimated` / `reconciled`). There is no code path that prints a
 * bare cost — an owner must always know whether a number is metered, projected,
 * or reconciled against the provider invoice before acting on it.
 */
interface BillingLine {
  amountMinor: number;
  currency: string;
  id: string;
  label: string;
  source: CostSource;
}

const LINES: readonly BillingLine[] = [
  { amountMinor: 4200000, currency: 'IDR', id: 'ai-tokens', label: 'Token AI (bulan berjalan)', source: 'measured' },
  { amountMinor: 850000, currency: 'IDR', id: 'messaging', label: 'Pesan keluar berbayar', source: 'measured' },
  { amountMinor: 6800000, currency: 'IDR', id: 'projection', label: 'Proyeksi total akhir bulan', source: 'estimated' },
  { amountMinor: 3950000, currency: 'IDR', id: 'reconciled', label: 'Tagihan provider terekonsiliasi (bulan lalu)', source: 'reconciled' },
];

export function UsageBilling() {
  return (
    <AppShell
      currentPath="/billing"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Penggunaan & Tagihan"
      surface="owner"
      tenantContext="All tenants"
    >
      <section aria-labelledby="billing-title" className="space-y-4">
        <h2 className="text-base font-semibold text-slate-950" id="billing-title">
          Penggunaan & tagihan
        </h2>
        <p className="text-sm text-slate-600">
          Setiap angka biaya menyertakan sumbernya: <strong>measured</strong> (diukur),{' '}
          <strong>estimated</strong> (perkiraan), atau <strong>reconciled</strong> (terekonsiliasi
          dengan provider).
        </p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {LINES.map((line) => (
            <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={line.id}>
              <span className="text-sm text-slate-700">{line.label}</span>
              <CostBadge
                amountMinor={line.amountMinor}
                currency={line.currency}
                locale="id-ID"
                source={line.source}
              />
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
