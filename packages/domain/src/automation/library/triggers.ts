import { randomUUID } from 'node:crypto';

import type { TriggerNode, TriggerType } from '../flow-types';

/**
 * Trigger factory helpers. Each returns a node definition with the canonical
 * default config for that trigger type.
 */

export function onMessageReceived(
  config: Record<string, unknown> = {},
): TriggerNode {
  return {
    id: `trigger-${randomId()}`,
    type: 'trigger',
    trigger: 'onMessageReceived',
    config,
  };
}

export function onLeadCreated(
  config: Record<string, unknown> = {},
): TriggerNode {
  return {
    id: `trigger-${randomId()}`,
    type: 'trigger',
    trigger: 'onLeadCreated',
    config,
  };
}

export function onPaymentReceived(
  config: Record<string, unknown> = {},
): TriggerNode {
  return {
    id: `trigger-${randomId()}`,
    type: 'trigger',
    trigger: 'onPaymentReceived',
    config,
  };
}

export function onShipmentDelivered(
  config: Record<string, unknown> = {},
): TriggerNode {
  return {
    id: `trigger-${randomId()}`,
    type: 'trigger',
    trigger: 'onShipmentDelivered',
    config,
  };
}

export const TRIGGER_TYPES: readonly TriggerType[] = [
  'onMessageReceived',
  'onLeadCreated',
  'onPaymentReceived',
  'onShipmentDelivered',
] as const;

function randomId(): string {
  // randomUUID, not Math.random: see actions.ts — persisted node ids need a
  // real collision guarantee.
  return randomUUID();
}
