import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TenantDetail } from './tenant-detail';

describe('TenantDetail', () => {
  it('keeps the tenant identity banner visible across tab switches', () => {
    render(<TenantDetail tenantId="tenant-nusantara" />);
    const banner = screen.getByRole('region', { name: 'Identitas tenant aktif' });
    expect(banner).toHaveTextContent('Nusantara Dental');
    expect(banner).toHaveTextContent('nusantara-dental');

    fireEvent.click(screen.getByRole('tab', { name: 'Channels' }));

    expect(
      screen.getByRole('region', { name: 'Identitas tenant aktif' }),
    ).toHaveTextContent('Nusantara Dental');
    expect(screen.getByText(/Tidak resmi/)).toBeVisible();
  });

  it('offers an invite control on the Users tab', () => {
    render(<TenantDetail tenantId="tenant-nusantara" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
    expect(screen.getByLabelText('Email undangan')).toBeVisible();
    expect(screen.getByRole('button', { name: /Kirim undangan/ })).toBeVisible();
  });

  it('falls back to a DRAFT identity for an unknown tenant', () => {
    render(<TenantDetail tenantId="tenant-unknown" />);
    expect(
      screen.getByRole('region', { name: 'Identitas tenant aktif' }),
    ).toHaveTextContent('DRAFT');
  });
});
