import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LogoutButton } from './logout-button';

describe('LogoutButton', () => {
  it('renders with default label', () => {
    render(<LogoutButton />);
    expect(screen.getByText('Sign out')).toBeVisible();
  });

  it('renders with custom label', () => {
    render(<LogoutButton label="Log out" />);
    expect(screen.getByText('Log out')).toBeVisible();
  });

  it('calls fetch on click', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 })
    );

    render(<LogoutButton />);
    fireEvent.click(screen.getByText('Sign out'));

    expect(fetchSpy).toHaveBeenCalledWith('/logout', { method: 'POST' });
    fetchSpy.mockRestore();
  });

  it('uses custom logout path', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 })
    );

    render(<LogoutButton logoutPath="/custom-logout" />);
    fireEvent.click(screen.getByText('Sign out'));

    expect(fetchSpy).toHaveBeenCalledWith('/custom-logout', { method: 'POST' });
    fetchSpy.mockRestore();
  });

  it('shows submitting state on click', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 })
    );

    render(<LogoutButton />);
    fireEvent.click(screen.getByText('Sign out'));

    expect(screen.getByText('Signing out...')).toBeVisible();
  });
});
