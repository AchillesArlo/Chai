'use client';

import type { FlowDefinition, FlowNode } from '../../types/automation';

interface FlowCanvasProps {
  definition: FlowDefinition;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
}

const TYPE_STYLES: Record<FlowNode['type'], string> = {
  trigger: 'border-brand-500 bg-brand-50',
  action: 'border-emerald-500 bg-emerald-50',
  condition: 'border-amber-500 bg-amber-50',
};

const TYPE_LABELS: Record<FlowNode['type'], string> = {
  trigger: 'Trigger',
  action: 'Action',
  condition: 'Condition',
};

export function FlowCanvas({ definition, selectedNodeId, onSelectNode }: FlowCanvasProps) {
  if (definition.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center border-2 border-dashed border-gray-200 p-8 text-sm text-gray-400">
        No nodes yet — add a trigger from the palette to start.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {definition.nodes.map((node) => {
        const isSelected = node.id === selectedNodeId;
        const kind = node.trigger ?? node.action ?? node.condition ?? node.id;
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode?.(node.id)}
            className={`block w-full rounded-md border-2 px-4 py-3 text-left transition hover:shadow-sm ${
              TYPE_STYLES[node.type]
            } ${isSelected ? 'ring-2 ring-brand-600' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {TYPE_LABELS[node.type]}
              </span>
              <span className="font-mono text-xs text-gray-400">{node.id}</span>
            </div>
            <div className="mt-1 text-sm font-medium text-gray-900">{kind}</div>
          </button>
        );
      })}
    </div>
  );
}
