// Local types for the owner-console automation builder.
// Mirrors @chai/domain contracts without importing them (keeps owner-console bundle lean).
export type NodeType = 'trigger' | 'action' | 'condition';

export interface FlowNode {
  id: string;
  type: NodeType;
  trigger?: string;
  action?: string;
  condition?: string;
  config: Record<string, unknown>;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type FlowStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'ARCHIVED';

export interface AutomationFlow {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  status: FlowStatus;
  version: number;
  definition: FlowDefinition;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowVersion {
  id: string;
  flowId: string;
  version: number;
  definition: FlowDefinition;
  changeLog?: string;
  publishedAt?: string;
  publishedBy?: string;
  createdAt: string;
}

export interface SimulationResult {
  id: string;
  flowId: string;
  version?: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: string;
  createdAt: string;
}
