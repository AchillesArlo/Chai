import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './toast';

function TestComponent({ message, tone }: { message: string; tone: 'success' | 'error' | 'info' | 'warning' }) {
  const { show } = useToast();
  return (
    <button onClick={() => show({ message, tone })} type="button">
      Show Toast
    </button>
  );
}

describe('Toast', () => {
  it('shows toast on trigger', async () => {
    render(
      <ToastProvider>
        <TestComponent message="Saved successfully" tone="success" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));

    await waitFor(() => {
      expect(screen.getByText('Saved successfully')).toBeVisible();
    });
  });

  it('dismisses toast on close button', async () => {
    render(
      <ToastProvider>
        <TestComponent message="Test toast" tone="info" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    await waitFor(() => expect(screen.getByText('Test toast')).toBeVisible());

    fireEvent.click(screen.getByLabelText('Dismiss'));

    await waitFor(() => {
      expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
    });
  });

  it('renders title when provided', async () => {
    function TitledToast() {
      const { show } = useToast();
      return (
        <button onClick={() => show({ message: 'Body', title: 'Success!', tone: 'success' })} type="button">
          Trigger
        </button>
      );
    }

    render(
      <ToastProvider>
        <TitledToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger'));
    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeVisible();
      expect(screen.getByText('Body')).toBeVisible();
    });
  });

  it('throws when useToast used outside provider', () => {
    function Orphan() {
      useToast();
      return null;
    }

    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow('useToast must be used within ToastProvider');
    spy.mockRestore();
  });
});
