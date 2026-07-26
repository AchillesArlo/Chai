/**
 * Automation flow node + definition types. Pure data contracts — no DB, no I/O.
 * The flow engine evaluates these against a FlowExecutionContext.
 */

export type NodeType = 'trigger' | 'action' | 'condition';

export type TriggerType =
  | 'onMessageReceived'
  | 'onLeadCreated'
  | 'onPaymentReceived'
  | 'onShipmentDelivered';

export type ActionType =
  | 'sendMessage'
  | 'createLead'
  | 'scheduleFollowUp'
  | 'notifyAgent'
  | 'updateStatus';

export type ConditionType =
  | 'checkKeyword'
  | 'checkTime'
  | 'checkTenantAttribute';

export interface TriggerNode {
  id: string;
  type: 'trigger';
  trigger: TriggerType;
  config: Record<string, unknown>;
}

export interface ActionNode {
  id: string;
  type: 'action';
  action: ActionType;
  config: Record<string, unknown>;
}

export interface ConditionNode {
  id: string;
  type: 'condition';
  condition: ConditionType;
  config: Record<string, unknown>;
}

export type FlowNode = TriggerNode | ActionNode | ConditionNode;

export interface FlowEdge {
  from: string;
  to: string;
  /** Optional branch label — 'true' / 'false' for condition nodes. */
  branch?: 'true' | 'false';
}

export interface FlowDefinition {
  id: string;
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type FlowExecutionStatus = 'COMPLETED' | 'SKIPPED' | 'FAILED';

export interface FlowExecutionStep {
  nodeId: string;
  status: FlowExecutionStatus;
  output: Record<string, unknown>;
  /** Skip reason when status === 'SKIPPED'. */
  skippedBecause?: string;
}

export interface FlowExecutionContext {
  tenantId: string;
  trigger: TriggerType;
  input: Record<string, unknown>;
  /** Accumulated variables — actions write, conditions read. */
  variables: Record<string, unknown>;
}

export interface FlowExecutionResult {
  status: FlowExecutionStatus;
  steps: FlowExecutionStep[];
}
