'use client';

import type { AuditLog } from '../../types/audit';

interface AuditLogDetailProps {
  log: AuditLog;
}

export function AuditLogDetail({ log }: AuditLogDetailProps) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Log Detail</h1>

      <div className="border rounded p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">ID</label>
            <p className="mt-1 font-mono text-sm">{log.id}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Timestamp
            </label>
            <p className="mt-1">{new Date(log.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Actor ID
            </label>
            <p className="mt-1 font-mono text-sm">{log.actorId}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tenant ID
            </label>
            <p className="mt-1 font-mono text-sm">{log.tenantId}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Action
            </label>
            <p className="mt-1">{log.action}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Resource Type
            </label>
            <p className="mt-1">{log.resourceType}</p>
          </div>
          {log.resourceId && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Resource ID
              </label>
              <p className="mt-1 font-mono text-sm">{log.resourceId}</p>
            </div>
          )}
          {log.ipAddress && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                IP Address
              </label>
              <p className="mt-1">{log.ipAddress}</p>
            </div>
          )}
          {log.userAgent && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                User Agent
              </label>
              <p className="mt-1 text-sm break-all">{log.userAgent}</p>
            </div>
          )}
          {log.metadata && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Metadata
              </label>
              <pre className="mt-1 bg-gray-50 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
