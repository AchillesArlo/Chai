'use client';

import { MoneyAmount } from './money-and-timeline';

/**
 * CostBadge (04_DESIGN_SYSTEM §4.4; REQ-03-014).
 *
 * A money figure is meaningless without knowing where it came from. Every cost
 * shown to an owner is rendered through this badge so it always carries its
 * source: `measured` (from usage events), `estimated` (projected, not final),
 * or `reconciled` (matched against the provider invoice). Money stays integer
 * minor units — formatting is delegated to MoneyAmount, no float arithmetic.
 */
export type CostSource = 'measured' | 'estimated' | 'reconciled';

const SOURCE_META: Record<CostSource, { className: string; title: string }> = {
  estimated: {
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    title: 'Perkiraan dari penggunaan berjalan; belum final.',
  },
  measured: {
    className: 'bg-blue-50 text-blue-700 ring-blue-200',
    title: 'Diukur dari peristiwa penggunaan aktual.',
  },
  reconciled: {
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    title: 'Sudah direkonsiliasi dengan tagihan provider.',
  },
};

export interface CostBadgeProps {
  amountMinor: number;
  currency: string;
  locale?: string;
  source: CostSource;
}

export function CostBadge({ amountMinor, currency, locale, source }: CostBadgeProps) {
  const meta = SOURCE_META[source];
  return (
    <span className="inline-flex items-center gap-2" data-cost-source={source}>
      <MoneyAmount
        amountMinor={amountMinor}
        className="font-semibold text-slate-900"
        currency={currency}
        locale={locale}
      />
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${meta.className}`}
        title={meta.title}
      >
        {source}
      </span>
    </span>
  );
}
