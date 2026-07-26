import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { QueryProvider } from '@chai/api-client/react';
import { UnifiedInbox } from './unified-inbox';

function renderWithProviders(ui: ReactElement) {
  return render(<QueryProvider>{ui}</QueryProvider>);
}

describe('Client Portal unified inbox', () => {
  it('renders the conversation queue scoped to customer operations', () => {
    renderWithProviders(<UnifiedInbox />);

    expect(screen.getByText('Customer operations')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeVisible();
    expect(screen.getByText('Open conversations')).toBeVisible();
    expect(screen.getByText('Awaiting human')).toBeVisible();
    expect(screen.queryByText('Internal control')).not.toBeInTheDocument();
  });
});
