'use client';

import { useState } from 'react';

import type { FlowDefinition } from '../../types/automation';

interface SimulationPanelProps {
  definition: FlowDefinition;
  flowId: string;
}

interface SimulationOutput {
  status: string;
  steps: Array<{ nodeId: string; status: string; output?: Record<string, unknown> }>;
}

// ponytail: simulate against the local API; no engine import to keep owner-console lean.
export function SimulationPanel({ definition, flowId }: SimulationPanelProps) {
  const [inputText, setInputText] = useState('{}');
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runSimulation() {
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const parsedInput = JSON.parse(inputText) as Record<string, unknown>;
      const res = await fetch(`/api/client/v1/automation/flows/${flowId}/simulate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: parsedInput }),
      });
      if (!res.ok) throw new Error(`Simulation failed: ${res.status}`);
      const data = (await res.json()) as SimulationOutput;
      setOutput(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Simulation
      </h3>
      <label className="mb-1 text-xs text-gray-600">Input (JSON)</label>
      <textarea
        className="mb-2 h-24 w-full rounded border border-gray-300 p-2 font-mono text-xs"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
      />
      <button
        type="button"
        disabled={running || definition.nodes.length === 0}
        onClick={runSimulation}
        className="mb-3 rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {running ? 'Running…' : 'Run Simulation'}
      </button>

      {error && <div className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      {output && (
        <div className="overflow-y-auto">
          <div className="mb-2 text-xs font-semibold text-gray-700">
            Status: <span className="font-mono">{output.status}</span>
          </div>
          <div className="space-y-2">
            {output.steps.map((step, idx) => (
              <div key={`${step.nodeId}-${idx}`} className="rounded border border-gray-200 p-2 text-xs">
                <div className="font-mono text-gray-500">{step.nodeId}</div>
                <div className="text-gray-700">{step.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
