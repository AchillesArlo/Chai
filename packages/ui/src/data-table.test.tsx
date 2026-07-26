import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable, type DataTableColumn } from './data-table';

interface TestRow extends Record<string, unknown> {
  id: string;
  age: number;
  name: string;
}

const rows: TestRow[] = [
  { age: 30, id: '1', name: 'Alice' },
  { age: 25, id: '2', name: 'Bob' },
  { age: 35, id: '3', name: 'Charlie' },
];

const columns: DataTableColumn<TestRow>[] = [
  { key: 'name', sortable: true, title: 'Name' },
  { key: 'age', sortable: true, title: 'Age' },
];

describe('DataTable', () => {
  it('renders rows', () => {
    render(<DataTable columns={columns} rowKey={(r) => r.id} rows={rows} />);
    expect(screen.getByText('Alice')).toBeVisible();
    expect(screen.getByText('Bob')).toBeVisible();
    expect(screen.getByText('Charlie')).toBeVisible();
  });

  it('renders column titles', () => {
    render(<DataTable columns={columns} rowKey={(r) => r.id} rows={rows} />);
    expect(screen.getByText('Name')).toBeVisible();
    expect(screen.getByText('Age')).toBeVisible();
  });

  it('shows empty message when no rows', () => {
    render(<DataTable columns={columns} emptyMessage="No results" rowKey={(r) => r.id} rows={[]} />);
    expect(screen.getByText('No results')).toBeVisible();
  });

  it('sorts by name ascending on click', () => {
    render(<DataTable columns={columns} rowKey={(r) => r.id} rows={rows} />);
    fireEvent.click(screen.getByText('Name'));

    const cells = screen.getAllByRole('cell');
    // First cell should be Alice (alphabetically first)
    expect(cells[0]).toHaveTextContent('Alice');
  });

  it('sorts by age numerically', () => {
    render(<DataTable columns={columns} rowKey={(r) => r.id} rows={rows} />);
    fireEvent.click(screen.getByText('Age'));

    const ageCells = screen.getAllByRole('cell').filter((c) => /\d/.test(c.textContent ?? ''));
    // Ascending: 25, 30, 35
    expect(ageCells[0]).toHaveTextContent('25');
  });

  it('toggles sort direction on second click', () => {
    render(<DataTable columns={columns} rowKey={(r) => r.id} rows={rows} />);
    fireEvent.click(screen.getByText('Name')); // asc
    fireEvent.click(screen.getByText('Name')); // desc

    const cells = screen.getAllByRole('cell');
    // Descending: Charlie first
    expect(cells[0]).toHaveTextContent('Charlie');
  });

  it('uses custom render function', () => {
    const customColumns: DataTableColumn<TestRow>[] = [
      {
        key: 'name',
        render: (row) => <strong>{row.name.toUpperCase()}</strong>,
        title: 'Name',
      },
    ];
    render(<DataTable columns={customColumns} rowKey={(r) => r.id} rows={rows} />);
    expect(screen.getByText('ALICE')).toBeVisible();
  });
});
