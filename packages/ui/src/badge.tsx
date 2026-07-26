'use client';

import type { ReactNode } from 'react';

export type BadgeTone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';

export interface BadgeProps {
  children: ReactNode;
  dot?: boolean;
  tone?: BadgeTone;
}

const toneStyles: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  default: 'bg-slate-100 text-slate-700 ring-slate-200',
  error: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const dotColors: Record<BadgeTone, string> = {
  brand: 'bg-brand-500',
  default: 'bg-slate-400',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
};

export function Badge({ children, dot = false, tone = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneStyles[tone]}`}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${dotColors[tone]}`}
        />
      ) : null}
      {children}
    </span>
  );
}
