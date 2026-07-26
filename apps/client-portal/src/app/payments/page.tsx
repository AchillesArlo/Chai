'use client';

import { AppShell, MoneyAmount, StatusBadge } from '@chai/ui';
import { useApiQuery } from '@chai/api-client/react';
import { CLIENT_PORTAL_NAVIGATION } from '../../config/navigation';

export interface PaymentItem {
  amount: number;
  checkoutUrl: string;
  currency: string;
  expiresAt: string;
  externalId: string;
  status: string;
}

function statusTone(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'PAID' || status === 'SUCCEEDED' || status === 'SETTLED') return 'success';
  if (status === 'PENDING') return 'warning';
  return 'danger';
}

export default function PaymentsPage() {
  const { data: payments, isLoading, error } = useApiQuery<PaymentItem[]>(
    ['payments'],
    '/client/v1/payments',
  );

  const rows = payments ?? [];

  return (
    <AppShell
      currentPath="/payments"
      navigation={CLIENT_PORTAL_NAVIGATION}
      pageTitle="Hosted payments"
      surface="client"
      tenantContext="Nusantara Dental"
    >
      <section className="space-y-4" aria-labelledby="payments-title">
        <div>
          <h2 className="text-base font-semibold text-slate-950" id="payments-title">
            Checkout sessions
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Hosted checkout links for direct client payments.
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            Loading payments…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-red-600">
            Failed to load payments. {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            No checkout sessions yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-xs">
            {rows.map((payment) => (
              <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm" key={payment.externalId}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-950">{payment.externalId}</span>
                    <span className="text-slate-300">•</span>
                    <MoneyAmount
                      amountMinor={payment.amount}
                      className="font-mono text-xs font-semibold text-brand-700"
                      currency={payment.currency}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Expires <time dateTime={payment.expiresAt}>{payment.expiresAt}</time>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={payment.status} tone={statusTone(payment.status)} />
                  <a
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    href={payment.checkoutUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open checkout
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
