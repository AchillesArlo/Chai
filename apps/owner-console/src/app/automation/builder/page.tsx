'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { FlowCanvas } from '../../../components/automation/FlowCanvas';
import { NodePalette } from '../../../components/automation/NodePalette';
import { SimulationPanel } from '../../../components/automation/SimulationPanel';
import { VersionHistory } from '../../../components/automation/VersionHistory';
import type { FlowDefinition, FlowNode } from '../../../types/automation';

function BuilderContent() {
  const params = useSearchParams();
  const flowId = params.get('id') ?? 'draft';

  const [name, setName] = useState('Untitled Flow');
  const [definition, setDefinition] = useState<FlowDefinition>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);

  function addNode(node: FlowNode) {
    setDefinition((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeId(node.id);
  }

  async function saveDraft() {
    await fetch('/api/client/v1/automation/flows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, definition }),
    });
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/automation" className="text-sm text-gray-500 hover:text-gray-900">
            ← Flows
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveDraft}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Save Draft
          </button>
          <button
            type="button"
            className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700"
          >
            Request Approval
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <NodePalette onAddNode={addNode} />
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <FlowCanvas
            definition={definition}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>
        <SimulationPanel definition={definition} flowId={flowId} />
      </div>

      <aside className="border-t border-gray-200 bg-white">
        <h3 className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Version History
        </h3>
        <VersionHistory flowId={flowId} />
      </aside>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading…</div>}>
      <BuilderContent />
    </Suspense>
  );
}
