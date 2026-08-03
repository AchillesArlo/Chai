import {
  isAutomationStopReason,
  type AutomationStopReason,
} from './stop-reasons';

/**
 * The six MVP automation templates (REQ-07-014;
 * 07_EVENTS_AUTOMATIONS_AND_JOBS.md §10). These are the canonical catalog a
 * tenant instantiates — not invented here, transcribed from the blueprint:
 *
 *   §10.1 No-response follow-up
 *   §10.2 Booking reminder
 *   §10.3 Hot lead notification
 *   §10.4 Knowledge freshness
 *   §10.5 Payment request/reminder
 *   §10.6 Shipment milestone and exception
 *
 * Each template is a faithful descriptor (trigger + guard conditions + ordered
 * steps + the canonical stop reasons it may halt on), richer than the flow
 * engine's five primitive actions can express, so it documents the automation
 * contract the builder/UI surfaces and the vocabulary a run persists against.
 */

export type AutomationTemplateId =
  | 'no-response-follow-up'
  | 'booking-reminder'
  | 'hot-lead-notification'
  | 'knowledge-freshness'
  | 'payment-request-reminder'
  | 'shipment-milestone-exception';

export interface AutomationTemplateStep {
  /** Stable, ordered step key. */
  key: string;
  /** Human-readable step summary (from the blueprint). */
  summary: string;
}

export interface AutomationTemplate {
  id: AutomationTemplateId;
  name: string;
  description: string;
  /** Canonical trigger token (blueprint prose, normalised). */
  trigger: string;
  /** Guard conditions evaluated before/while running. */
  conditions: readonly string[];
  /** Ordered steps. */
  steps: readonly AutomationTemplateStep[];
  /** The canonical stop reasons this template may halt on. */
  stopReasons: readonly AutomationStopReason[];
}

const NO_RESPONSE_FOLLOW_UP: AutomationTemplate = {
  id: 'no-response-follow-up',
  name: 'No-response follow-up',
  description:
    'Nudges a waiting lead conversation with an approved template after a configurable wait, re-checking stop rules before each send and capping attempts.',
  trigger: 'lead.conversation.waiting',
  conditions: [
    'consent valid',
    'lead not closed',
    'no customer reply',
    'channel connected',
    'within permitted send policy',
  ],
  steps: [
    { key: 'wait', summary: 'Wait configurable duration.' },
    { key: 're-evaluate-stop-rules', summary: 'Re-evaluate stop rules.' },
    { key: 'choose-message', summary: 'Choose approved template/message.' },
    { key: 'send', summary: 'Send.' },
    { key: 'wait-again', summary: 'Wait.' },
    {
      key: 'maybe-repeat',
      summary: 'Optionally repeat within max count.',
    },
  ],
  stopReasons: [
    'CUSTOMER_REPLIED',
    'OPT_OUT',
    'LEAD_CLOSED',
    'BOOKING_CREATED',
    'CHANNEL_UNAVAILABLE',
    'WINDOW_POLICY_BLOCKED',
    'MAX_ATTEMPTS',
    'MANUAL_STOP',
  ],
};

const BOOKING_REMINDER: AutomationTemplate = {
  id: 'booking-reminder',
  name: 'Booking reminder',
  description:
    'Schedules reminders relative to a confirmed appointment, re-checking status before each send; a customer reply can branch to reschedule or handover.',
  trigger: 'appointment.confirmed',
  conditions: [
    'consent valid',
    'appointment still active',
    'channel connected',
    'within permitted send policy',
  ],
  steps: [
    {
      key: 'schedule-relative-reminders',
      summary: 'Schedule reminders relative to the appointment.',
    },
    {
      key: 'recheck-status',
      summary: 'Recheck appointment status before send.',
    },
    { key: 'send-reminder', summary: 'Send the reminder.' },
    {
      key: 'branch-on-reply',
      summary: 'Customer reply can branch to reschedule/handover.',
    },
  ],
  stopReasons: [
    'CUSTOMER_REPLIED',
    'ORDER_OR_BOOKING_CANCELLED',
    'CHANNEL_UNAVAILABLE',
    'WINDOW_POLICY_BLOCKED',
    'MANUAL_STOP',
  ],
};

const HOT_LEAD_NOTIFICATION: AutomationTemplate = {
  id: 'hot-lead-notification',
  name: 'Hot lead notification',
  description:
    'When a qualified lead meets score/rules threshold, assigns/alerts the team, deduplicated by lead + score version + stage.',
  trigger: 'lead.qualified',
  conditions: ['score/rules meet threshold'],
  steps: [
    {
      key: 'evaluate-threshold',
      summary: 'If score/rules meet threshold, proceed.',
    },
    { key: 'assign-or-alert', summary: 'Assign/alert the client team.' },
    {
      key: 'dedupe',
      summary: 'Deduplicate by lead + score version + stage.',
    },
  ],
  stopReasons: ['LEAD_CLOSED', 'MANUAL_STOP'],
};

const KNOWLEDGE_FRESHNESS: AutomationTemplate = {
  id: 'knowledge-freshness',
  name: 'Knowledge freshness',
  description:
    'On a source reaching next_review_at, notifies owner/manager and marks the source stale after a grace period, optionally restricting AI use after expiry.',
  trigger: 'knowledge.next_review_at',
  conditions: ['source past next_review_at'],
  steps: [
    { key: 'notify-owner', summary: 'Notify owner/manager.' },
    {
      key: 'mark-stale',
      summary: 'Mark source stale after grace period.',
    },
    {
      key: 'restrict-ai-optional',
      summary: 'Optionally restrict AI use after expiry.',
    },
  ],
  stopReasons: ['MANUAL_STOP'],
};

const PAYMENT_REQUEST_REMINDER: AutomationTemplate = {
  id: 'payment-request-reminder',
  name: 'Payment request/reminder',
  description:
    'Creates one hosted payment link on an approved invoice/order/booking deposit and reminds until settled, reconciling status and re-checking consent/channel window before each reminder.',
  trigger: 'invoice.approved',
  conditions: [
    'consent valid',
    'channel connected',
    'within permitted send policy',
  ],
  steps: [
    {
      key: 'create-hosted-link',
      summary:
        'Create one hosted link using business reference + idempotency key.',
    },
    {
      key: 'send-summary',
      summary: 'Send amount/currency/purpose/merchant/expiry summary.',
    },
    {
      key: 'reconcile-before-reminder',
      summary:
        'Before each reminder, reconcile status and re-evaluate consent/channel window.',
    },
    {
      key: 'send-reminder',
      summary:
        'Send reminder. Redirect/screenshot/customer claim does not trigger the paid branch.',
    },
  ],
  stopReasons: [
    'PAID',
    'EXPIRED',
    'CANCELLED',
    'CUSTOMER_REPLIED',
    'OPT_OUT',
    'ORDER_OR_BOOKING_CANCELLED',
    'MANUAL_STOP',
  ],
};

const SHIPMENT_MILESTONE_EXCEPTION: AutomationTemplate = {
  id: 'shipment-milestone-exception',
  name: 'Shipment milestone and exception',
  description:
    'Sends only tenant-configured shipment milestones on canonical status transitions (not every duplicate scan) and opens an exception on stale/failed/lost/damaged/customs states.',
  trigger: 'shipment.status.transition',
  conditions: [
    'canonical status transition (not a duplicate provider scan)',
    'tenant-configured milestone',
    'consent/channel policy',
    'dedup key',
  ],
  steps: [
    {
      key: 'send-configured-milestone',
      summary:
        'Send only tenant-configured milestones with consent/channel policy and dedup key.',
    },
    {
      key: 'open-exception',
      summary:
        'Open exception on stale, delivery failed, address issue, lost, damaged, customs hold, or returning state.',
    },
    {
      key: 'assign-or-handover',
      summary:
        'Assign/alert client team and optionally open/handover conversation.',
    },
  ],
  stopReasons: ['DELIVERED', 'RETURNED', 'CANCELLED', 'MANUAL_STOP'],
};

/** The six MVP templates, in blueprint order (§10.1–§10.6). */
export const MVP_AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  NO_RESPONSE_FOLLOW_UP,
  BOOKING_REMINDER,
  HOT_LEAD_NOTIFICATION,
  KNOWLEDGE_FRESHNESS,
  PAYMENT_REQUEST_REMINDER,
  SHIPMENT_MILESTONE_EXCEPTION,
];

/** Look up a template by id. */
export function getAutomationTemplate(
  id: AutomationTemplateId,
): AutomationTemplate | undefined {
  return MVP_AUTOMATION_TEMPLATES.find((template) => template.id === id);
}

export interface TemplateValidationIssue {
  templateId: AutomationTemplateId;
  problem: string;
}

/**
 * Validates a template's integrity: it has steps, guard conditions, and — the
 * point of REQ-07-014 — every declared stop reason is a canonical enum member,
 * never a free string. Returns the list of issues (empty = valid).
 */
export function validateAutomationTemplate(
  template: AutomationTemplate,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  if (template.steps.length === 0) {
    issues.push({ templateId: template.id, problem: 'template has no steps' });
  }
  if (template.conditions.length === 0) {
    issues.push({
      templateId: template.id,
      problem: 'template has no guard conditions',
    });
  }
  if (template.stopReasons.length === 0) {
    issues.push({
      templateId: template.id,
      problem: 'template declares no stop reasons',
    });
  }
  for (const reason of template.stopReasons) {
    if (!isAutomationStopReason(reason)) {
      issues.push({
        templateId: template.id,
        problem: `non-canonical stop reason: ${reason}`,
      });
    }
  }
  const stepKeys = template.steps.map((step) => step.key);
  if (new Set(stepKeys).size !== stepKeys.length) {
    issues.push({
      templateId: template.id,
      problem: 'duplicate step keys',
    });
  }
  return issues;
}

/** Validate all six templates; returns every issue across the catalog. */
export function validateAllTemplates(): TemplateValidationIssue[] {
  return MVP_AUTOMATION_TEMPLATES.flatMap(validateAutomationTemplate);
}
