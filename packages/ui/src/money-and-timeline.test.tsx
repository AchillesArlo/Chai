import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EventTimeline,
  formatMoneyMinor,
  minorUnitScale,
  MoneyAmount,
  OfflineNotice,
  SavingIndicator,
} from './money-and-timeline';

/**
 * Fase 4 (R-22) regression: money is minor-unit-safe and the blueprint UI states
 * exist. These fail if IDR ever gets divided by 100, if a non-integer minor
 * amount is rendered as a number, or if the offline/saving states disappear.
 */
describe('money formatting', () => {
  it('treats zero-decimal currencies as whole units', () => {
    expect(minorUnitScale('IDR')).toBe(1);
    expect(minorUnitScale('idr')).toBe(1);
    expect(minorUnitScale('USD')).toBe(100);
  });

  it('renders rupiah without inventing decimals', () => {
    const formatted = formatMoneyMinor(75_000, 'IDR');
    expect(formatted).toContain('75.000');
    expect(formatted).not.toContain('750,00');
  });

  it('renders two-decimal currencies from minor units', () => {
    expect(formatMoneyMinor(1_234, 'USD', 'en-US')).toBe('$12.34');
  });

  it('refuses to render a non-integer minor amount', () => {
    render(<MoneyAmount amountMinor={12.5} currency="IDR" />);
    // A fractional minor unit means precision was already lost upstream.
    expect(screen.getByText('Tidak tersedia')).toBeVisible();
  });

  it('renders an amount with its currency recorded', () => {
    render(<MoneyAmount amountMinor={75_000} currency="IDR" />);
    expect(screen.getByText(/75\.000/)).toHaveAttribute('data-currency', 'IDR');
  });
});

describe('event timeline', () => {
  it('renders entries as an ordered list with their own timestamps', () => {
    render(
      <EventTimeline
        ariaLabel="Riwayat pengiriman"
        entries={[
          { at: '2026-07-26T09:00:00Z', id: '1', label: 'Dijemput' },
          { at: '2026-07-26T12:00:00Z', id: '2', label: 'Terkirim', tone: 'success' },
        ]}
      />,
    );

    const list = screen.getByRole('list', { name: 'Riwayat pengiriman' });
    expect(list.tagName).toBe('OL');
    expect(screen.getByText('Dijemput')).toBeVisible();
    expect(screen.getByText('2026-07-26T12:00:00Z')).toBeVisible();
  });

  it('says so when there is nothing to show instead of rendering an empty list', () => {
    render(<EventTimeline ariaLabel="Riwayat" entries={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Belum ada kejadian');
  });
});

describe('offline and saving states', () => {
  it('distinguishes offline from an error', () => {
    render(<OfflineNotice />);
    expect(screen.getByRole('status')).toHaveTextContent('Sedang offline');
  });

  it('announces saving progress politely', () => {
    const { rerender } = render(<SavingIndicator state="saving" />);
    expect(screen.getByRole('status')).toHaveTextContent('Menyimpan…');

    rerender(<SavingIndicator state="saved" />);
    expect(screen.getByRole('status')).toHaveTextContent('Tersimpan');
  });

  it('renders nothing while idle', () => {
    render(<SavingIndicator state="idle" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
