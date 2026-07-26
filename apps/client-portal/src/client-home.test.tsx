import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClientHome, ClientLoginPanel } from './client-home';

describe('Client Portal shell', () => {
  it('renders transparent customer outcomes without internal controls', () => {
    render(<ClientHome />);

    expect(screen.getByText('Customer operations')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Good afternoon, Nusantara Dental' })).toBeVisible();
    expect(screen.getByText('Successful outcomes')).toBeVisible();
    expect(screen.getByText('Human handovers')).toBeVisible();
    expect(screen.getByText('AI used published knowledge')).toBeVisible();
    expect(screen.getByText('Needs your attention')).toBeVisible();
    expect(screen.queryByText('Internal control')).not.toBeInTheDocument();
  });

  it('uses a separate invite-only client login surface', () => {
    render(<ClientLoginPanel localAccessEnabled={true} />);

    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    expect(screen.getByText(/invite-only/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use local client identity' })).toBeVisible();
    expect(screen.queryByText(/founder sign in/i)).not.toBeInTheDocument();
  });
});
