import { AlertTriangle, CheckCircle2, Clock3, Info, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

export function MetricCard({
  freshness,
  label,
  trend,
  value,
}: {
  freshness: string;
  label: string;
  trend?: string;
  value: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        {trend ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <TrendingUp aria-hidden="true" className="size-3.5" />
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Clock3 aria-hidden="true" className="size-3.5" />
        {freshness}
      </p>
    </article>
  );
}

const bannerStyles = {
  partial: 'border-blue-200 bg-blue-50 text-blue-900',
  stale: 'border-amber-200 bg-amber-50 text-amber-950',
} as const;

export function DataStateBanner({
  detail,
  state,
}: {
  detail: string;
  state: keyof typeof bannerStyles;
}) {
  const Icon = state === 'stale' ? AlertTriangle : Info;
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${bannerStyles[state]}`}
      role="status"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold capitalize">{state} data</p>
        <p className="mt-0.5 opacity-85">{detail}</p>
      </div>
    </div>
  );
}

const badgeStyles = {
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
} as const;

export function StatusBadge({
  icon,
  label,
  tone,
}: {
  icon?: ReactNode;
  label: string;
  tone: keyof typeof badgeStyles;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${badgeStyles[tone]}`}
    >
      {icon ?? <CheckCircle2 aria-hidden="true" className="size-3.5" />}
      {label}
    </span>
  );
}
