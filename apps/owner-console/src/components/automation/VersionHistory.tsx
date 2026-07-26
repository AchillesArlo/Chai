'use client';

import { useEffect, useState } from 'react';

import type { FlowVersion } from '../../types/automation';

interface VersionHistoryProps {
  flowId: string;
}

export function VersionHistory({ flowId }: VersionHistoryProps) {
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/client/v1/automation/flows/${flowId}/versions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FlowVersion[]) => {
        if (!cancelled) setVersions(data);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flowId]);

  if (loading) return <div className="p-3 text-sm text-gray-400">Loading versions…</div>;
  if (versions.length === 0)
    return <div className="p-3 text-sm text-gray-400">No published versions yet.</div>;

  return (
    <div className="divide-y divide-gray-100">
      {versions.map((v) => (
        <div key={v.id} className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">v{v.version}</span>
            {v.publishedAt && (
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                Published
              </span>
            )}
          </div>
          {v.changeLog && <div className="mt-1 text-xs text-gray-600">{v.changeLog}</div>}
          <div className="mt-1 text-xs text-gray-400">
            {v.publishedAt ? new Date(v.publishedAt).toLocaleString() : new Date(v.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
