import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeVisible();
  });

  it('applies default tone', () => {
    const { container } = render(<Badge>Test</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-slate-100');
  });

  it('applies success tone', () => {
    const { container } = render(<Badge tone="success">Active</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-emerald-50');
    expect(badge.className).toContain('text-emerald-700');
  });

  it('applies brand tone', () => {
    const { container } = render(<Badge tone="brand">New</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-brand-50');
  });

  it('renders dot when dot prop is true', () => {
    const { container } = render(<Badge dot={true} tone="success">Online</Badge>);
    // Dot is a span with bg-emerald-500 class
    const spans = container.querySelectorAll('span');
    const dot = Array.from(spans).find((s) => s.className.includes('bg-emerald-500'));
    expect(dot).toBeDefined();
  });

  it('does not render dot by default', () => {
    const { container } = render(<Badge tone="success">Online</Badge>);
    const spans = container.querySelectorAll('span');
    const dot = Array.from(spans).find((s) => s.className.includes('bg-emerald-500'));
    expect(dot).toBeUndefined();
  });
});
