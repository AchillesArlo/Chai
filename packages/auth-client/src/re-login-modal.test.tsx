import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReLoginModal } from './re-login-modal';

describe('ReLoginModal', () => {
  it('renders when open', () => {
    render(
      <ReLoginModal onClose={vi.fn()} onReLogin={vi.fn()} open={true} />
    );
    expect(screen.getByText('Session Expired')).toBeVisible();
    expect(screen.getByText(/session has expired/i)).toBeVisible();
  });

  it('does not render when closed', () => {
    render(
      <ReLoginModal onClose={vi.fn()} onReLogin={vi.fn()} open={false} />
    );
    expect(screen.queryByText('Session Expired')).not.toBeInTheDocument();
  });

  it('calls onReLogin when sign in button clicked', () => {
    const onReLogin = vi.fn();
    render(
      <ReLoginModal onClose={vi.fn()} onReLogin={onReLogin} open={true} />
    );

    fireEvent.click(screen.getByText('Sign in again'));
    expect(onReLogin).toHaveBeenCalled();
  });

  it('calls onClose when dismiss clicked', () => {
    const onClose = vi.fn();
    render(
      <ReLoginModal onClose={onClose} onReLogin={vi.fn()} open={true} />
    );

    fireEvent.click(screen.getByText('Dismiss'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows redirecting state after click', () => {
    render(
      <ReLoginModal onClose={vi.fn()} onReLogin={vi.fn()} open={true} />
    );

    fireEvent.click(screen.getByText('Sign in again'));
    expect(screen.getByText('Redirecting...')).toBeVisible();
  });

  it('disables button while redirecting', () => {
    render(
      <ReLoginModal onClose={vi.fn()} onReLogin={vi.fn()} open={true} />
    );

    fireEvent.click(screen.getByText('Sign in again'));
    expect(screen.getByText('Redirecting...')).toBeDisabled();
  });
});
