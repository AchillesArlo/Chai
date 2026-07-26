import type { ActionNode, ActionType } from '../flow-types';

/**
 * Action factory helpers. Each returns a node definition; the actual side
 * effect is provided by the caller via FlowEngineHandlers.
 */

export function sendMessage(
  config: Record<string, unknown> = {},
): ActionNode {
  return node('sendMessage', config);
}

export function createLead(
  config: Record<string, unknown> = {},
): ActionNode {
  return node('createLead', config);
}

export function scheduleFollowUp(
  config: Record<string, unknown> = {},
): ActionNode {
  return node('scheduleFollowUp', config);
}

export function notifyAgent(
  config: Record<string, unknown> = {},
): ActionNode {
  return node('notifyAgent', config);
}

export function updateStatus(
  config: Record<string, unknown> = {},
): ActionNode {
  return node('updateStatus', config);
}

export const ACTION_TYPES: readonly ActionType[] = [
  'sendMessage',
  'createLead',
  'scheduleFollowUp',
  'notifyAgent',
  'updateStatus',
] as const;

function node(action: ActionType, config: Record<string, unknown>): ActionNode {
  return {
    id: `action-${action}-${randomId()}`,
    type: 'action',
    action,
    config,
  };
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
