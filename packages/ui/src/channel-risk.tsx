'use client';

import { AlertTriangle, ShieldCheck } from 'lucide-react';

/**
 * ChannelRiskBadge (03_UX_UI §5.7, §13; REQ-03-011).
 *
 * A community/unofficial channel (WhatsApp Web session) must never look
 * identical to an official Meta Direct channel: the number can be blocked at any
 * time and delivery is not guaranteed. Built here in FASE 24 so FASE 25's
 * Community Gateway can state its risk at the point of use without touching UI
 * again.
 */
export type ChannelRisk = 'official' | 'community';

export interface ChannelRiskBadgeProps {
  label?: string;
  risk: ChannelRisk;
}

export function ChannelRiskBadge({ label, risk }: ChannelRiskBadgeProps) {
  if (risk === 'community') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-300"
        data-channel-risk="community"
        role="status"
        title="Kanal komunitas tidak resmi: nomor dapat diblokir kapan saja dan tidak ada jaminan pengiriman."
      >
        <AlertTriangle aria-hidden="true" className="size-3.5" />
        {label ?? 'Tidak resmi · risiko tinggi'}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200"
      data-channel-risk="official"
    >
      <ShieldCheck aria-hidden="true" className="size-3.5" />
      {label ?? 'Kanal resmi'}
    </span>
  );
}
