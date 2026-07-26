'use client';

import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface DataTableColumn<T> {
  key: keyof T;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  title: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  emptyMessage?: string;
  rows: T[];
  rowKey: (row: T) => string;
}

type SortDirection = 'asc' | 'desc';

export function DataTable<T extends Record<string, unknown>>({
  columns,
  emptyMessage = 'No data available',
  rows,
  rowKey,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal;
      }
      return String(aVal).localeCompare(String(bVal));
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [rows, sortColumn, sortDirection]);

  function handleSort(key: keyof T) {
    if (sortColumn === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(key);
      setSortDirection('asc');
    }
  }

  if (sortedRows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="px-4 py-3 text-left font-semibold text-slate-700"
              >
                {col.sortable ? (
                  <button
                    className="inline-flex items-center gap-1 hover:text-slate-950"
                    onClick={() => handleSort(col.key)}
                    type="button"
                  >
                    {col.title}
                    {sortColumn === col.key ? (
                      sortDirection === 'asc' ? (
                        <ChevronUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ChevronDown aria-hidden="true" className="size-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.title
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4 py-3 text-slate-700">
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
