'use client';

import { AppShell, EventTimeline, type TimelineEntry } from '@chai/ui';
import { useApiQuery } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export interface ShipmentItem {
  carrier: string;
  lastSyncedAt: string;
  status: string;
  trackingNumber: string;
}

// Milestone codes come from the logistics connector (LINKED..DELIVERED).
const statusTone: Record<string, NonNullable<TimelineEntry['tone']>> = {
  DELIVERED: 'success',
  OUT_FOR_DELIVERY: 'info',
  IN_TRANSIT: 'info',
  PICKED_UP: 'info',
  LINKED: 'neutral',
  EXCEPTION: 'danger',
  STALE: 'warning',
  UNKNOWN: 'neutral',
};

export default function ShipmentsPage() {
  const { data: shipments, isLoading, error } = useApiQuery<ShipmentItem[]>(
    ['logistics', 'shipments'],
    '/client/v1/logistics/shipments',
  );

  const entries: TimelineEntry[] = (shipments ?? [])
    .slice()
    .sort((a, b) => b.lastSyncedAt.localeCompare(a.lastSyncedAt))
    .map((shipment) => ({
      at: shipment.lastSyncedAt,
      description: `Carrier: ${shipment.carrier}`,
      id: shipment.trackingNumber,
      label: `${shipment.trackingNumber} — ${shipment.status}`,
      tone: statusTone[shipment.status] ?? 'neutral',
    }));

  return (
    <AppShell
      currentPath="/shipments"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Shipment tracking"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <section className="space-y-4" aria-labelledby="shipments-title">
        <div>
          <h2 className="text-base font-semibold text-slate-950" id="shipments-title">
            Linked shipments
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Live logistics tracking and automated status sync.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading shipments…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">Failed to load shipments. {error.message}</p>
          ) : (
            <EventTimeline
              ariaLabel="Shipment status updates"
              emptyLabel="No shipments linked yet."
              entries={entries}
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}
