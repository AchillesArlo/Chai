import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './avatar';

describe('Avatar', () => {
  it('renders image when src provided', () => {
    render(<Avatar alt="John Doe" src="https://example.com/avatar.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    expect(img).toHaveAttribute('alt', 'John Doe');
  });

  it('renders initials when no src', () => {
    render(<Avatar alt="John Doe" />);
    expect(screen.getByText('JD')).toBeVisible();
  });

  it('uses fallback for initials', () => {
    render(<Avatar alt="User" fallback="John Doe" />);
    expect(screen.getByText('JD')).toBeVisible();
  });

  it('uses first letter of single word', () => {
    render(<Avatar alt="Admin" />);
    expect(screen.getByText('A')).toBeVisible();
  });

  it('uppercase initials', () => {
    render(<Avatar alt="john doe" />);
    expect(screen.getByText('JD')).toBeVisible();
  });

  it('applies size classes', () => {
    const { container: smContainer } = render(<Avatar alt="Test" size="sm" />);
    const smAvatar = smContainer.firstChild as HTMLElement;
    expect(smAvatar.className).toContain('size-7');

    const { container: lgContainer } = render(<Avatar alt="Test" size="lg" />);
    const lgAvatar = lgContainer.firstChild as HTMLElement;
    expect(lgAvatar.className).toContain('size-12');
  });

  it('has aria-label for accessibility', () => {
    render(<Avatar alt="Jane Smith" />);
    expect(screen.getByLabelText('Jane Smith')).toBeInTheDocument();
  });
});
