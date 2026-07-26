import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tabs } from './tabs';

describe('Tabs', () => {
  const items = [
    { content: <p>First tab content</p>, label: 'First' },
    { content: <p>Second tab content</p>, label: 'Second' },
    { content: <p>Third tab content</p>, label: 'Third' },
  ];

  it('renders first tab by default', () => {
    render(<Tabs items={items} />);
    expect(screen.getByText('First tab content')).toBeVisible();
  });

  it('renders all tab labels', () => {
    render(<Tabs items={items} />);
    expect(screen.getByText('First')).toBeVisible();
    expect(screen.getByText('Second')).toBeVisible();
    expect(screen.getByText('Third')).toBeVisible();
  });

  it('switches tab on click', () => {
    render(<Tabs items={items} />);
    fireEvent.click(screen.getByText('Second'));
    expect(screen.getByText('Second tab content')).toBeVisible();
    expect(screen.queryByText('First tab content')).not.toBeInTheDocument();
  });

  it('respects defaultIndex', () => {
    render(<Tabs defaultIndex={1} items={items} />);
    expect(screen.getByText('Second tab content')).toBeVisible();
  });

  it('marks active tab with aria-selected', () => {
    render(<Tabs items={items} />);
    const firstTab = screen.getByText('First').closest('[role="tab"]');
    expect(firstTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByText('Second'));
    const secondTab = screen.getByText('Second').closest('[role="tab"]');
    expect(secondTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders nothing for empty items', () => {
    const { container } = render(<Tabs items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
