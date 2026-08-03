import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UsageBilling } from './usage-billing';

describe('UsageBilling', () => {
  it('shows the three cost sources', () => {
    render(<UsageBilling />);
    expect(screen.getAllByText('measured').length).toBeGreaterThan(0);
    expect(screen.getAllByText('estimated').length).toBeGreaterThan(0);
    expect(screen.getAllByText('reconciled').length).toBeGreaterThan(0);
  });

  it('never renders a money amount without a source label', () => {
    const { container } = render(<UsageBilling />);
    const amounts = container.querySelectorAll('[data-currency]');
    const sources = container.querySelectorAll('[data-cost-source]');
    expect(amounts.length).toBeGreaterThan(0);
    expect(sources.length).toBe(amounts.length);
  });
});
