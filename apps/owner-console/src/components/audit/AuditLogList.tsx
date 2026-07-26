'use client';

import { useState } from 'react';
import type { AuditLog } from '../../types/audit';

interface AuditLogListProps {
  logs: AuditLog[];
  onFilterChange: (filters: {
    actorId?: string;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
  }) => void;
}

export function AuditLogList({ logs, onFilterChange }: AuditLogListProps) {
  const [filters, setFilters] = useState({
    actorId: '',
    action: '',
    resourceType: '',
    startDate: '',
    endDate: '',
  });

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange({
      ...newFilters,
      actorId: newFilters.actorId || undefined,
      action: newFilters.action || undefined,
      resourceType: newFilters.resourceType || undefined,
      startDate: newFilters.startDate || undefined,
      endDate: newFilters.endDate || undefined,
    });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>

      <div className="mb-6 grid grid-cols-5 gap-4">
        <input
          type="text"
          placeholder="Actor ID"
          value={filters.actorId}
          onChange={(e) => handleFilterChange('actorId', e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          type="text"
          placeholder="Action"
          value={filters.action}
          onChange={(e) => handleFilterChange('action', e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          type="text"
          placeholder="Resource Type"
          value={filters.resourceType}
          onChange={(e) => handleFilterChange('resourceType', e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => handleFilterChange('startDate', e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => handleFilterChange('endDate', e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="border rounded">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Timestamp</th>
              <th className="px-4 py-2 text-left">Actor</th>
              <th className="px-4 py-2 text-left">Action</th>
              <th className="px-4 py-2 text-left">Resource</th>
              <th className="px-4 py-2 text-left">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 font-mono text-sm">{log.actorId}</td>
                <td className="px-4 py-2">{log.action}</td>
                <td className="px-4 py-2">
                  {log.resourceType}
                  {log.resourceId && (
                    <span className="ml-2 text-gray-500 text-sm">
                      {log.resourceId}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-sm">{log.ipAddress || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
