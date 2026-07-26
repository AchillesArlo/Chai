import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TenantsOverview } from './tenants-overview';

describe('Owner Console tenant directory', () => {
  it('renders the platform tenant directory without customer surfaces', () => {
    render(<TenantsOverview />);

    expect(screen.getByText('Internal control')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Tenant Directory' })).toBeVisible();
    expect(screen.getByText('Tenant directory')).toBeVisible();
    expect(screen.getByText('Risk flags')).toBeVisible();
    expect(screen.getAllByText(/Updated/).length).toBeGreaterThan(1);
    expect(screen.queryByText('Customer operations')).not.toBeInTheDocument();
  });

  it('surfaces a tenant status badge for triage', () => {
    render(<TenantsOverview />);

    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
  });
});
