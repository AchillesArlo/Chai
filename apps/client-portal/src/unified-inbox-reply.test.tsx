import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { ApiError } from '@chai/api-client';
import { QueryProvider } from '@chai/api-client/react';
import { UnifiedInbox } from './unified-inbox';

/**
 * Gelombang 2 regression: the composer sends through the real reply endpoint.
 *
 * The mutation is captured so the test can assert the two headers the API
 * actually requires — a missing Idempotency-Key means the send is rejected, and
 * a missing If-Match means a stale reply could overwrite someone else's change.
 */
const mutateAsync = vi.fn();
const refetch = vi.fn();

vi.mock('@chai/api-client/react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const conversations = [
    {
      id: 'conv-1',
      contactId: 'contact-1',
      lastMessageAt: '2026-07-26T00:00:00.000Z',
      mode: 'HUMAN_ACTIVE',
      status: 'OPEN',
      version: 7,
    },
  ];
  return {
    ...actual,
    useApiMutation: () => ({ isPending: false, mutateAsync }),
    useApiQuery: () => ({ data: conversations, error: null, isLoading: false, refetch }),
  };
});

function renderWithProviders(ui: ReactElement) {
  return render(<QueryProvider>{ui}</QueryProvider>);
}

async function typeReply(text: string): Promise<void> {
  const input = await screen.findByRole('textbox', { name: 'Balasan' });
  fireEvent.change(input, { target: { value: text } });
}

function clickSend(): void {
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

interface CapturedCall {
  body: { text: string };
  config: { headers: Record<string, string>; idempotencyKey: string };
}

describe('Client Portal unified inbox reply composer', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    refetch.mockReset();
  });

  it('sends the reply with an idempotency key and the If-Match precondition', async () => {
    mutateAsync.mockResolvedValue({
      createdAt: '2026-07-26T01:00:00.000Z',
      id: 'msg-1',
      text: 'Pesanan Anda sudah dikirim.',
    });
    renderWithProviders(<UnifiedInbox />);

    await typeReply('Pesanan Anda sudah dikirim.');
    clickSend();

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mutateAsync.mock.calls[0]?.[0] as CapturedCall;
    expect(call.body.text).toBe('Pesanan Anda sudah dikirim.');
    // The version read from the list, quoted as an entity tag.
    expect(call.config.headers['if-match']).toBe('"7"');
    expect(call.config.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

    // What is rendered comes from the API response, not from local state. It
    // appears twice on purpose: as the thread bubble and as the list preview.
    const rendered = await screen.findAllByText('Pesanan Anda sudah dikirim.');
    expect(rendered).toHaveLength(2);
  });

  it('reuses the same idempotency key when a failed send is retried', async () => {
    mutateAsync.mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR', 'Network request failed'),
    );
    mutateAsync.mockResolvedValueOnce({
      createdAt: '2026-07-26T01:00:00.000Z',
      id: 'msg-1',
      text: 'Coba lagi',
    });
    renderWithProviders(<UnifiedInbox />);

    await typeReply('Coba lagi');
    clickSend();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/gagal terkirim/i);
    });

    clickSend();
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(2);
    });

    const first = mutateAsync.mock.calls[0]?.[0] as CapturedCall;
    const second = mutateAsync.mock.calls[1]?.[0] as CapturedCall;
    // A fresh key on retry would send the customer a second copy of the message.
    expect(second.config.idempotencyKey).toBe(first.config.idempotencyKey);
  });

  it('refuses to retry blindly when the conversation moved on', async () => {
    mutateAsync.mockRejectedValue(new ApiError(409, 'VERSION_CONFLICT', 'stale version'));
    renderWithProviders(<UnifiedInbox />);

    await typeReply('Balasan basi');
    clickSend();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/sudah berubah/i);
    });
    // The operator must see the new state first, so the list is reloaded.
    expect(refetch).toHaveBeenCalled();
    // Nothing the operator wrote is thrown away.
    expect(screen.getByRole('textbox', { name: 'Balasan' })).toHaveValue('Balasan basi');
  });
});
