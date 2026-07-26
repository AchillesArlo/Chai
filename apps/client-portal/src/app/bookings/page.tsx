'use client';

import { Calendar, Plus } from 'lucide-react';
import { AppShell, MetricCard, StatusBadge } from '@chai/ui';
import { useApiQuery } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export interface BookingRow {
  contactId: string;
  endsAt: string;
  id: string;
  resourceId: string;
  startsAt: string;
  status: string;
  title: string;
}

export default function BookingsPage() {
  const { data: appointments, isLoading, error } = useApiQuery<BookingRow[]>(
    ['appointments'],
    '/client/v1/appointments',
  );

  const rows = appointments ?? [];
  const confirmedCount = rows.filter((row) => row.status === 'CONFIRMED').length;

  return (
    <AppShell
      currentPath="/bookings"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Bookings & Appointments"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard freshness="live" label="Total Appointments" value={isLoading ? '—' : String(rows.length)} />
          <MetricCard freshness="live" label="Confirmed" value={isLoading ? '—' : String(confirmedCount)} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-base font-semibold text-slate-950">Upcoming Appointments</h2>
            <button className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" /> New Booking
            </button>
          </div>

          {isLoading ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">Loading appointments…</div>
          ) : error ? (
            <div className="px-6 py-12 text-center text-sm text-red-600">Failed to load appointments. {error.message}</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">No appointments scheduled.</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {rows.map((booking) => (
                <li key={booking.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 font-medium text-slate-700">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{booking.title}</p>
                      <p className="text-xs text-slate-500">
                        {booking.contactId} • <time dateTime={booking.startsAt}>{booking.startsAt}</time> – <time dateTime={booking.endsAt}>{booking.endsAt}</time>
                      </p>
                    </div>
                  </div>
                  <StatusBadge label={booking.status} tone={booking.status === 'CONFIRMED' ? 'success' : 'warning'} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
