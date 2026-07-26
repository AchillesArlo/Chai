'use client';

import type { FlowNode } from '../../types/automation';

interface NodePaletteProps {
  onAddNode: (node: FlowNode) => void;
}

interface PaletteEntry {
  type: FlowNode['type'];
  kind: string;
  label: string;
}

const TRIGGERS: PaletteEntry[] = [
  { type: 'trigger', kind: 'onMessageReceived', label: 'Message Received' },
  { type: 'trigger', kind: 'onLeadCreated', label: 'Lead Created' },
  { type: 'trigger', kind: 'onPaymentReceived', label: 'Payment Received' },
  { type: 'trigger', kind: 'onShipmentDelivered', label: 'Shipment Delivered' },
];

const ACTIONS: PaletteEntry[] = [
  { type: 'action', kind: 'sendMessage', label: 'Send Message' },
  { type: 'action', kind: 'createLead', label: 'Create Lead' },
  { type: 'action', kind: 'scheduleFollowUp', label: 'Schedule Follow-Up' },
  { type: 'action', kind: 'notifyAgent', label: 'Notify Agent' },
  { type: 'action', kind: 'updateStatus', label: 'Update Status' },
];

const CONDITIONS: PaletteEntry[] = [
  { type: 'condition', kind: 'checkKeyword', label: 'Keyword Match' },
  { type: 'condition', kind: 'checkTime', label: 'Time Window' },
  { type: 'condition', kind: 'checkTenantAttribute', label: 'Tenant Attribute' },
];

function Section({
  title,
  entries,
  onAddNode,
}: {
  title: string;
  entries: PaletteEntry[];
  onAddNode: (node: FlowNode) => void;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="space-y-1">
        {entries.map((entry) => (
          <button
            key={`${entry.type}-${entry.kind}`}
            type="button"
            onClick={() =>
              onAddNode({
                id: `${entry.kind}-${Math.random().toString(36).slice(2, 8)}`,
                type: entry.type,
                [entry.type === 'trigger' ? 'trigger' : entry.type === 'action' ? 'action' : 'condition']:
                  entry.kind,
                config: {},
              } as FlowNode)
            }
            className="block w-full rounded border border-gray-200 px-3 py-2 text-left text-sm hover:border-brand-400 hover:bg-brand-50"
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3">
      <Section title="Triggers" entries={TRIGGERS} onAddNode={onAddNode} />
      <Section title="Actions" entries={ACTIONS} onAddNode={onAddNode} />
      <Section title="Conditions" entries={CONDITIONS} onAddNode={onAddNode} />
    </div>
  );
}
