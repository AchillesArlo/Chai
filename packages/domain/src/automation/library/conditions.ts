import type { ConditionNode, ConditionType } from '../flow-types';

/**
 * Condition factory helpers. Each returns a node definition; the boolean
 * evaluation is provided by the caller via FlowEngineHandlers.
 */

export function checkKeyword(
  config: Record<string, unknown> = {},
): ConditionNode {
  return node('checkKeyword', config);
}

export function checkTime(
  config: Record<string, unknown> = {},
): ConditionNode {
  return node('checkTime', config);
}

export function checkTenantAttribute(
  config: Record<string, unknown> = {},
): ConditionNode {
  return node('checkTenantAttribute', config);
}

export const CONDITION_TYPES: readonly ConditionType[] = [
  'checkKeyword',
  'checkTime',
  'checkTenantAttribute',
] as const;

function node(condition: ConditionType, config: Record<string, unknown>): ConditionNode {
  return {
    id: `condition-${condition}-${randomId()}`,
    type: 'condition',
    condition,
    config,
  };
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
