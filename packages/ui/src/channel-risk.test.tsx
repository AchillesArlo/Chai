import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChannelRiskBadge } from './channel-risk';

describe('ChannelRiskBadge', () => {
  it('marks a community channel as high-risk and unofficial', () => {
    render(<ChannelRiskBadge risk="community" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent(/Tidak resmi/);
    expect(badge).toHaveAttribute('data-channel-risk', 'community');
    expect(badge.getAttribute('title')).toMatch(/dapat diblokir/);
  });

  it('renders an official channel with distinct styling and copy', () => {
    render(<ChannelRiskBadge risk="official" />);
    expect(screen.getByText('Kanal resmi')).toBeVisible();
  });

  it('does not present community and official identically', () => {
    const community = render(<ChannelRiskBadge risk="community" />);
    const communityText = community.container.textContent;
    community.unmount();
    const official = render(<ChannelRiskBadge risk="official" />);
    expect(official.container.textContent).not.toEqual(communityText);
  });

  it('allows an explicit label override', () => {
    render(<ChannelRiskBadge label="WAHA session" risk="community" />);
    expect(screen.getByText('WAHA session')).toBeVisible();
  });
});
