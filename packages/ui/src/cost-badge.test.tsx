import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CostBadge } from './cost-badge';

describe('CostBadge', () => {
  it('renders the money amount alongside its source label', () => {
    render(<CostBadge amountMinor={125000} currency="IDR" locale="id-ID" source="measured" />);
    const badge = screen.getByText('measured');
    expect(badge).toBeVisible();
    expect(badge.closest('[data-cost-source="measured"]')).not.toBeNull();
  });

  it('supports the three cost sources', () => {
    render(
      <div>
        <CostBadge amountMinor={100} currency="IDR" source="measured" />
        <CostBadge amountMinor={200} currency="IDR" source="estimated" />
        <CostBadge amountMinor={300} currency="IDR" source="reconciled" />
      </div>,
    );
    expect(screen.getByText('measured')).toBeVisible();
    expect(screen.getByText('estimated')).toBeVisible();
    expect(screen.getByText('reconciled')).toBeVisible();
  });

  it('carries an explanatory tooltip for the source', () => {
    render(<CostBadge amountMinor={500} currency="IDR" source="reconciled" />);
    expect(screen.getByText('reconciled').getAttribute('title')).toMatch(/direkonsiliasi/);
  });
});
