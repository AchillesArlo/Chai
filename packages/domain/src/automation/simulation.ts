import type {
  FlowDefinition,
  FlowExecutionContext,
  FlowExecutionResult,
  FlowExecutionStep,
  FlowNode,
  TriggerType,
} from './flow-types';
import { type FlowEngineHandlers, executeFlow } from './flow-engine';

export interface SimulationStep extends FlowExecutionStep {
  /** Human-readable label copied from the node for UI display. */
  label: string;
}

export interface SimulationResult {
  status: FlowExecutionResult['status'];
  output: Record<string, unknown>;
  trace: SimulationStep[];
  startedAt: string;
  finishedAt: string;
}

/**
 * Dry-run a flow definition against a synthetic input. No side effects — the
 * caller-provided handlers are expected to be pure recorders. The trace
 * preserves step order plus a label so the UI can render the path taken.
 */
export function simulateFlow(
  definition: FlowDefinition,
  input: Record<string, unknown>,
  handlers: FlowEngineHandlers,
  options: { tenantId?: string; trigger?: TriggerType } = {},
): SimulationResult {
  const triggerNode = definition.nodes.find((n) => n.type === 'trigger');
  const trigger: TriggerType =
    options.trigger ??
    (triggerNode && triggerNode.type === 'trigger' ? triggerNode.trigger : 'onMessageReceived');
  const startedAt = new Date().toISOString();
  const context: FlowExecutionContext = {
    tenantId: options.tenantId ?? 'sim-tenant',
    trigger,
    input,
    variables: { ...input },
  };

  const result = executeFlow(definition, context, handlers);
  const finishedAt = new Date().toISOString();

  const trace: SimulationStep[] = result.steps.map((step) => {
    const node = definition.nodes.find((n) => n.id === step.nodeId);
    const label = node ? labelFor(node) : step.nodeId;
    return { ...step, label };
  });

  return {
    status: result.status,
    output: context.variables,
    trace,
    startedAt,
    finishedAt,
  };
}

function labelFor(node: FlowNode): string {
  const id = node.id;
  if (node.type === 'trigger') return `Trigger: ${node.trigger}`;
  if (node.type === 'action') return `Action: ${node.action}`;
  if (node.type === 'condition') return `Condition: ${node.condition}`;
  return id;
}
