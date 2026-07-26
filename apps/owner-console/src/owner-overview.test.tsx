import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OwnerLoginPanel, OwnerOverview } from './owner-overview';

describe('Owner Console shell', () => {
  it('renders a distinct internal overview with health and freshness', () => {
    render(<OwnerOverview />);

    expect(screen.getByText('Internal control')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ikhtisar Platform Global' })).toBeVisible();
    expect(screen.getByText('Ringkasan Keandalan & Peringatan Sistem')).toBeVisible();
    expect(screen.getByText('Total Klien Aktif')).toBeVisible();
    expect(screen.getByText('Antrean Pemantauan Risiko & Kesehatan Klien (Tenant)')).toBeVisible();
    expect(screen.getByText('Kesehatan Platform')).toBeVisible();
    expect(screen.queryByText('Customer operations')).not.toBeInTheDocument();
  });

  it('uses a separate invite-free owner login surface', () => {
    render(<OwnerLoginPanel localAccessEnabled={true} />);

    expect(screen.getByRole('heading', { name: 'Login Pemilik Platform (Founder)' })).toBeVisible();
    expect(screen.getByText(/otentikasi MFA/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Gunakan Identitas Founder Lokal' })).toBeVisible();
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();
  });
});
