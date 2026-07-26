import type {
  ActionNode,
  ConditionNode,
  FlowDefinition,
  FlowEdge,
  FlowExecutionContext,
  FlowExecutionResult,
  FlowExecutionStep,
  FlowNode,
  FlowExecutionStatus,
  TriggerNode,
} from './flow-types';

/**
 * Pure flow engine. No DB, no I/O. Action/condition evaluation delegates to
 * injected handlers so the engine stays free of side-effecting dependencies.
 */

export type ActionHandler = (
  node: ActionNode,
  context: FlowExecutionContext,
) => Record<string, unknown>;

export type ConditionHandler = (
  node: ConditionNode,
  context: FlowExecutionContext,
) => boolean;

export interface FlowEngineHandlers {
  actions: Partial<Record<ActionNode['action'], ActionHandler>>;
  conditions: Partial<Record<ConditionNode['condition'], ConditionHandler>>;
}

interface ExecutionState {
  context: FlowExecutionContext;
  steps: FlowExecutionStep[];
  visited: Set<string>;
  status: FlowExecutionStatus;
}

function findTrigger(definition: FlowDefinition): TriggerNode | undefined {
  return definition.nodes.find((n): n is TriggerNode => n.type === 'trigger');
}

function outgoingEdges(definition: FlowDefinition, nodeId: string): FlowEdge[] {
  return definition.edges.filter((e) => e.from === nodeId);
}

function nodeById(definition: FlowDefinition, id: string): FlowNode | undefined {
  return definition.nodes.find((n) => n.id === id);
}

function nextNodeId(
  definition: FlowDefinition,
  fromId: string,
  branch?: 'true' | 'false',
): string | undefined {
  const edges = outgoingEdges(definition, fromId);
  const match =
    branch !== undefined
      ? edges.find((e) => e.branch === branch)
      : edges[0];
  return match?.to;
}

/**
 * Walks the graph from the trigger's downstream node, executing actions in
 * sequence and branching on conditions. Stops at first FAILED step.
 */
export function executeFlow(
  definition: FlowDefinition,
  context: FlowExecutionContext,
  handlers: FlowEngineHandlers,
): FlowExecutionResult {
  const trigger = findTrigger(definition);
  const state: ExecutionState = {
    context,
    steps: [],
    visited: new Set<string>(),
    status: 'COMPLETED',
  };

  if (!trigger) {
    return { status: 'COMPLETED', steps: [] };
  }

  if (trigger.trigger !== context.trigger) {
    return { status: 'SKIPPED', steps: [] };
  }

  let cursor = nextNodeId(definition, trigger.id);
  while (cursor !== undefined) {
    if (state.visited.has(cursor)) break;
    state.visited.add(cursor);

    const node = nodeById(definition, cursor);
    if (!node) break;

    const step = runNode(node, state, handlers, definition);
    state.steps.push(step);

    if (step.status === 'FAILED') {
      state.status = 'FAILED';
      break;
    }

    cursor = advance(node, step, definition);
  }

  return { status: state.status, steps: state.steps };
}

function runNode(
  node: FlowNode,
  state: ExecutionState,
  handlers: FlowEngineHandlers,
  _definition?: FlowDefinition,
): FlowExecutionStep {
  void _definition;
  if (node.type === 'trigger') {
    return { nodeId: node.id, status: 'SKIPPED', output: {}, skippedBecause: 'trigger-not-executed-as-step' };
  }
  if (node.type === 'action') {
    const handler = handlers.actions[node.action];
    if (!handler) {
      return {
        nodeId: node.id,
        status: 'FAILED',
        output: {},
        skippedBecause: `no-handler:${node.action}`,
      };
    }
    try {
      const output = handler(node, state.context);
      mergeVariables(state.context, output);
      return { nodeId: node.id, status: 'COMPLETED', output };
    } catch (err) {
      return {
        nodeId: node.id,
        status: 'FAILED',
        output: {},
        skippedBecause: err instanceof Error ? err.message : 'action-threw',
      };
    }
  }
  // condition
  const handler = handlers.conditions[node.condition];
  if (!handler) {
    return {
      nodeId: node.id,
      status: 'FAILED',
      output: {},
      skippedBecause: `no-handler:${node.condition}`,
    };
  }
  const passed = handler(node, state.context);
  return {
    nodeId: node.id,
    status: 'COMPLETED',
    output: { passed },
  };
}

function mergeVariables(
  context: FlowExecutionContext,
  output: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(output)) {
    context.variables[key] = value;
  }
}

function advance(
  node: FlowNode,
  step: FlowExecutionStep,
  definition: FlowDefinition,
): string | undefined {
  if (node.type === 'condition') {
    const passed = step.output['passed'] === true;
    return nextNodeId(definition, node.id, passed ? 'true' : 'false');
  }
  return nextNodeId(definition, node.id);
}
