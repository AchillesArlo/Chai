import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { QueryProvider } from '@chai/api-client/react';
import { UnifiedInbox } from './unified-inbox';

// Seed one conversation so the thread + reply composer render. The reply
// endpoint does not exist in the API, so the composer must be disabled.
vi.mock('@chai/api-client/react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const conversations = [
    {
      id: 'conv-1',
      contactId: 'contact-1',
      mode: 'HUMAN_ACTIVE',
      status: 'OPEN',
      lastMessageAt: '2026-07-26T00:00:00.000Z',
    },
  ];
  const queryResult = { data: conversations, isLoading: false, error: null };
  return { ...actual, useApiQuery: () => queryResult };
});

function renderWithProviders(ui: ReactElement) {
  return render(<QueryProvider>{ui}</QueryProvider>);
}

describe('Client Portal unified inbox reply composer', () => {
  it('disables sending because the API exposes no conversation reply endpoint', async () => {
    renderWithProviders(<UnifiedInbox />);

    const send = await screen.findByRole('button', { name: /send/i });
    expect(send).toBeDisabled();
    expect(screen.getByText(/reply endpoint/i)).toBeVisible();
  });
});
