import type { ReactNode } from 'react';

/**
 * Money is always minor units + currency (05_DATA_MODEL §1, 04_DESIGN_SYSTEM §14).
 *
 * The component takes an integer and never performs authoritative arithmetic:
 * floating-point maths on money in the browser is how a total shown to a
 * customer stops matching the amount actually charged. Formatting is the only
 * thing that happens here.
 */
export interface MoneyAmountProps {
  /** Amount in the currency's smallest unit, e.g. 75000 for Rp 750,00. */
  amountMinor: number;
  className?: string;
  /** ISO 4217 code. Drives both the symbol and the number of decimals. */
  currency: string;
  /** Locale for grouping and decimal separators. */
  locale?: string;
  /** Shown when the amount is genuinely unknown, rather than rendering zero. */
  unavailableLabel?: string;
}

/**
 * Decimal places per currency. IDR and JPY have none, so dividing by 100 would
 * inflate every rupiah figure by two orders of magnitude.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['IDR', 'JPY', 'KRW', 'VND']);

export function minorUnitScale(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;
}

/** Formats minor units without any lossy intermediate arithmetic. */
export function formatMoneyMinor(
  amountMinor: number,
  currency: string,
  locale = 'id-ID',
): string {
  const scale = minorUnitScale(currency);
  const fractionDigits = scale === 1 ? 0 : 2;
  const formatter = new Intl.NumberFormat(locale, {
    currency: currency.toUpperCase(),
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: 'currency',
  });
  // Integer division keeps the units exact; the remainder is formatted, never
  // accumulated.
  return formatter.format(amountMinor / scale);
}

export function MoneyAmount({
  amountMinor,
  className,
  currency,
  locale = 'id-ID',
  unavailableLabel = 'Tidak tersedia',
}: MoneyAmountProps) {
  if (!Number.isFinite(amountMinor) || !Number.isInteger(amountMinor)) {
    // A non-integer minor amount means the caller lost precision upstream.
    // Showing a number here would launder that error.
    return (
      <span className={className} data-state="unavailable">
        {unavailableLabel}
      </span>
    );
  }
  return (
    <span className={className} data-currency={currency.toUpperCase()}>
      {formatMoneyMinor(amountMinor, currency, locale)}
    </span>
  );
}

const timelineTones = {
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-slate-300',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
} as const;

export interface TimelineEntry {
  /** ISO timestamp from the provider, shown as-is with its own label. */
  at: string;
  description?: string;
  id: string;
  label: string;
  tone?: keyof typeof timelineTones;
}

/**
 * Ordered event timeline for a payment or a shipment.
 *
 * Rendered as an ordered list so a screen reader announces the sequence, and
 * each entry carries its own timestamp: a customer needs to know *when* the
 * carrier said something, not just what it said (04 §14, 03 §12).
 */
export function EventTimeline({
  ariaLabel,
  emptyLabel = 'Belum ada kejadian',
  entries,
}: {
  ariaLabel: string;
  emptyLabel?: string;
  entries: readonly TimelineEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500" role="status">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ol aria-label={ariaLabel} className="space-y-3">
      {entries.map((entry) => (
        <li className="flex gap-3" key={entry.id}>
          <span
            aria-hidden="true"
            className={`mt-1.5 size-2 shrink-0 rounded-full ${
              timelineTones[entry.tone ?? 'neutral']
            }`}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">{entry.label}</p>
            {entry.description ? (
              <p className="text-sm text-slate-600">{entry.description}</p>
            ) : null}
            <time className="text-xs text-slate-500" dateTime={entry.at}>
              {entry.at}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Offline state (03 §8).
 *
 * Distinct from an error: nothing failed, the client simply cannot reach the
 * server right now, and any unsent work is still pending rather than lost.
 */
export function OfflineNotice({
  detail = 'Perubahan akan dikirim ulang setelah koneksi kembali.',
  onRetry,
}: {
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800"
      role="status"
    >
      <span aria-hidden="true" className="mt-0.5 size-2 rounded-full bg-slate-400" />
      <div className="min-w-0">
        <p className="font-semibold">Sedang offline</p>
        <p className="mt-0.5 text-slate-600">{detail}</p>
        {onRetry ? (
          <button
            className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-white"
            onClick={onRetry}
            type="button"
          >
            Coba sambungkan lagi
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Saving state (03 §8): the mutation is in flight and the surface is not yet
 * consistent with what the user sees. Announced politely so assistive tech
 * reports progress without interrupting.
 */
export function SavingIndicator({
  label = 'Menyimpan…',
  savedLabel = 'Tersimpan',
  state,
}: {
  label?: string;
  savedLabel?: string;
  state: 'idle' | 'saving' | 'saved';
}) {
  if (state === 'idle') return null;
  return (
    <span
      aria-live="polite"
      className="inline-flex items-center gap-2 text-xs text-slate-600"
      data-state={state}
      role="status"
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${
          state === 'saving' ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
        }`}
      />
      {state === 'saving' ? label : savedLabel}
    </span>
  );
}

/** Wraps content that must not be interactive while a mutation is in flight. */
export function SavingOverlay({
  children,
  saving,
}: {
  children: ReactNode;
  saving: boolean;
}) {
  return (
    <div aria-busy={saving} className={saving ? 'pointer-events-none opacity-60' : ''}>
      {children}
    </div>
  );
}
