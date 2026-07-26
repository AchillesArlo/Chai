import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReliabilityOverview } from './reliability-overview';

describe('Owner Console reliability overview', () => {
  it('surfaces freshness, risk, and reliability without customer surfaces', () => {
    render(<ReliabilityOverview />);

    expect(screen.getByText('Internal control')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Reliability' })).toBeVisible();
    expect(screen.getByText('Data freshness')).toBeVisible();
    expect(screen.getByText('Open incidents')).toBeVisible();
    expect(screen.getAllByText(/Updated/).length).toBeGreaterThan(1);
    expect(screen.queryByText('Customer operations')).not.toBeInTheDocument();
  });
});
