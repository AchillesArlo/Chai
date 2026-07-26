import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Chart } from './chart';

const data = [
  { label: 'Jan', value: 10 },
  { label: 'Feb', value: 20 },
  { label: 'Mar', value: 15 },
];

describe('Chart', () => {
  it('renders bar chart with data', () => {
    render(<Chart data={data} type="bar" />);
    const chart = screen.getByRole('img', { name: 'Bar chart' });
    expect(chart).toBeVisible();
  });

  it('renders line chart with data', () => {
    render(<Chart data={data} type="line" />);
    const chart = screen.getByRole('img', { name: 'Line chart' });
    expect(chart).toBeVisible();
  });

  it('shows empty message when no data', () => {
    render(<Chart data={[]} />);
    expect(screen.getByText('No data to display')).toBeVisible();
  });

  it('renders labels for bar chart', () => {
    render(<Chart data={data} type="bar" />);
    expect(screen.getByText('Jan')).toBeVisible();
    expect(screen.getByText('Feb')).toBeVisible();
    expect(screen.getByText('Mar')).toBeVisible();
  });

  it('renders labels for line chart', () => {
    render(<Chart data={data} type="line" />);
    expect(screen.getByText('Jan')).toBeVisible();
    expect(screen.getByText('Feb')).toBeVisible();
    expect(screen.getByText('Mar')).toBeVisible();
  });

  it('defaults to bar chart', () => {
    render(<Chart data={data} />);
    expect(screen.getByRole('img', { name: 'Bar chart' })).toBeVisible();
  });
});
