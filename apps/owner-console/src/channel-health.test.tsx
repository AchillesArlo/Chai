import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChannelHealth } from './channel-health';

describe('ChannelHealth', () => {
  it('renders the provider/account matrix', () => {
    render(<ChannelHealth />);
    expect(screen.getByRole('heading', { name: 'Matriks provider & akun' })).toBeVisible();
    expect(screen.getByText('community-nusantara-1')).toBeVisible();
  });

  it('marks the community gateway high-risk and distinct from official channels', () => {
    render(<ChannelHealth />);
    expect(screen.getAllByText(/Tidak resmi/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kanal resmi').length).toBeGreaterThan(0);
  });
});
