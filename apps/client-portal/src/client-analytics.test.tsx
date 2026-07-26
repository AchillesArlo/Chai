import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { QueryProvider } from '@chai/api-client/react';
import { ClientAnalytics } from './client-analytics';

function renderWithProviders(ui: ReactElement) {
  return render(<QueryProvider>{ui}</QueryProvider>);
}

describe('Client Portal analytics dashboard', () => {
  it('discloses metric lineage rather than bare numbers', () => {
    renderWithProviders(<ClientAnalytics />);

    expect(screen.getByText('Customer operations')).toBeVisible();
    expect(screen.getByRole('heading', { name: /Analytics & Insights/i })).toBeVisible();
    expect(screen.getByText('Automation rate')).toBeVisible();
    expect(screen.getByText('Qualified leads')).toBeVisible();
    expect(screen.getByText('Average CSAT')).toBeVisible();
    expect(screen.queryByText('Internal control')).not.toBeInTheDocument();
  });
});
