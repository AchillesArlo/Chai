'use client';

import { AppShell, Button, ChannelRiskBadge, StatusBadge } from '@chai/ui';

import { OWNER_CONSOLE_NAVIGATION } from './config/navigation';

/**
 * Global Channel Health (03_UX_UI §5.7, REQ-03-011).
 *
 * The provider matrix must make an unofficial Community Gateway account visibly
 * different from an official Meta Direct one (ChannelRiskBadge). Metrics for the
 * community channel are shown but must never be blended with official-channel
 * SLAs — the roadmap forbids sharing a delivery path or a burn-rate line.
 */
type ChannelStatus = 'Connected' | 'Degraded' | 'Reauth required' | 'Blocked' | 'Disabled';

interface ChannelRow {
  account: string;
  deliveryFailure: string;
  id: string;
  provider: string;
  rateLimit: string;
  risk: 'official' | 'community';
  sessionExpiry: string;
  status: ChannelStatus;
  webhookLatency: string;
}

const STATUS_TONE: Record<ChannelStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Blocked: 'danger',
  Connected: 'success',
  Degraded: 'warning',
  Disabled: 'neutral',
  'Reauth required': 'warning',
};

const ROWS: readonly ChannelRow[] = [
  {
    account: 'wa-nusantara-1',
    deliveryFailure: '0.2%',
    id: 'meta-1',
    provider: 'WhatsApp · Meta Direct',
    rateLimit: 'OK',
    risk: 'official',
    sessionExpiry: '43 hari',
    status: 'Connected',
    webhookLatency: '120 ms',
  },
  {
    account: 'wa-surya-1',
    deliveryFailure: '1.8%',
    id: 'meta-2',
    provider: 'WhatsApp · Meta Direct',
    rateLimit: 'Mendekati batas',
    risk: 'official',
    sessionExpiry: '12 hari',
    status: 'Degraded',
    webhookLatency: '410 ms',
  },
  {
    account: 'community-nusantara-1',
    deliveryFailure: 'Tanpa jaminan',
    id: 'community-1',
    provider: 'Community Gateway · WAHA',
    rateLimit: 'Konservatif',
    risk: 'community',
    sessionExpiry: 'Sesi bisa putus',
    status: 'Connected',
    webhookLatency: '900 ms',
  },
];

export function ChannelHealth() {
  return (
    <AppShell
      currentPath="/channel-health"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Kesehatan Kanal Global"
      surface="owner"
      tenantContext="All tenants"
    >
      <section aria-labelledby="channel-health-title" className="space-y-4">
        <h2 className="text-base font-semibold text-slate-950" id="channel-health-title">
          Matriks provider & akun
        </h2>
        <p className="text-sm text-slate-600">
          Kanal komunitas tidak resmi ditandai eksplisit dan metriknya tidak digabung dengan SLA
          kanal resmi.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2" scope="col">Provider</th>
                <th className="px-3 py-2" scope="col">Akun</th>
                <th className="px-3 py-2" scope="col">Risiko</th>
                <th className="px-3 py-2" scope="col">Status</th>
                <th className="px-3 py-2" scope="col">Latensi webhook</th>
                <th className="px-3 py-2" scope="col">Kedaluwarsa token/sesi</th>
                <th className="px-3 py-2" scope="col">Gagal kirim</th>
                <th className="px-3 py-2" scope="col">Rate limit</th>
                <th className="px-3 py-2" scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROWS.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-medium text-slate-900">{row.provider}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.account}</td>
                  <td className="px-3 py-2">
                    <ChannelRiskBadge risk={row.risk} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge label={row.status} tone={STATUS_TONE[row.status]} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.webhookLatency}</td>
                  <td className="px-3 py-2 text-slate-700">{row.sessionExpiry}</td>
                  <td className="px-3 py-2 text-slate-700">{row.deliveryFailure}</td>
                  <td className="px-3 py-2 text-slate-700">{row.rateLimit}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary">Uji koneksi</Button>
                      <Button size="sm" variant="ghost">Reconnect</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
