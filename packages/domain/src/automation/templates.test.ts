import { describe, expect, it } from 'vitest';

import {
  assertAutomationStopReason,
  AUTOMATION_STOP_REASONS,
  isAutomationStopReason,
} from './stop-reasons';
import {
  getAutomationTemplate,
  MVP_AUTOMATION_TEMPLATES,
  validateAllTemplates,
  validateAutomationTemplate,
  type AutomationTemplateId,
} from './templates';

describe('MVP automation templates (REQ-07-014)', () => {
  it('registers exactly the six blueprint templates in §10 order', () => {
    expect(MVP_AUTOMATION_TEMPLATES).toHaveLength(6);
    expect(MVP_AUTOMATION_TEMPLATES.map((template) => template.id)).toEqual([
      'no-response-follow-up',
      'booking-reminder',
      'hot-lead-notification',
      'knowledge-freshness',
      'payment-request-reminder',
      'shipment-milestone-exception',
    ]);
  });

  it('has no integrity issues across the whole catalog', () => {
    expect(validateAllTemplates()).toEqual([]);
  });

  // One assertion block per template — each of the six is tested on its own.
  const EXPECTATIONS: Record<
    AutomationTemplateId,
    { trigger: string; mustStopOn: string; minSteps: number }
  > = {
    'no-response-follow-up': {
      trigger: 'lead.conversation.waiting',
      mustStopOn: 'MAX_ATTEMPTS',
      minSteps: 4,
    },
    'booking-reminder': {
      trigger: 'appointment.confirmed',
      mustStopOn: 'ORDER_OR_BOOKING_CANCELLED',
      minSteps: 3,
    },
    'hot-lead-notification': {
      trigger: 'lead.qualified',
      mustStopOn: 'LEAD_CLOSED',
      minSteps: 3,
    },
    'knowledge-freshness': {
      trigger: 'knowledge.next_review_at',
      mustStopOn: 'MANUAL_STOP',
      minSteps: 3,
    },
    'payment-request-reminder': {
      trigger: 'invoice.approved',
      mustStopOn: 'PAID',
      minSteps: 4,
    },
    'shipment-milestone-exception': {
      trigger: 'shipment.status.transition',
      mustStopOn: 'DELIVERED',
      minSteps: 3,
    },
  };

  for (const template of MVP_AUTOMATION_TEMPLATES) {
    describe(`template: ${template.id}`, () => {
      const expected = EXPECTATIONS[template.id];

      it('is individually valid', () => {
        expect(validateAutomationTemplate(template)).toEqual([]);
      });

      it('is retrievable by id', () => {
        expect(getAutomationTemplate(template.id)).toBe(template);
      });

      it('uses its canonical blueprint trigger', () => {
        expect(template.trigger).toBe(expected.trigger);
      });

      it('declares ordered steps with unique keys', () => {
        expect(template.steps.length).toBeGreaterThanOrEqual(expected.minSteps);
        const keys = template.steps.map((step) => step.key);
        expect(new Set(keys).size).toBe(keys.length);
      });

      it('halts only on canonical stop reasons, including its signature reason', () => {
        expect(template.stopReasons.length).toBeGreaterThan(0);
        for (const reason of template.stopReasons) {
          expect(isAutomationStopReason(reason)).toBe(true);
        }
        expect(template.stopReasons).toContain(expected.mustStopOn);
      });
    });
  }
});

describe('automation stop-reason enum', () => {
  it('accepts every canonical reason', () => {
    for (const reason of AUTOMATION_STOP_REASONS) {
      expect(isAutomationStopReason(reason)).toBe(true);
      expect(assertAutomationStopReason(reason)).toBe(reason);
    }
  });

  it('rejects a free-form string, so stop reasons can never be arbitrary', () => {
    expect(isAutomationStopReason('because I felt like it')).toBe(false);
    expect(isAutomationStopReason('customer_replied')).toBe(false); // wrong case
    expect(isAutomationStopReason('')).toBe(false);
    expect(() => assertAutomationStopReason('NOT_A_REASON')).toThrow(
      /unknown automation stop reason/,
    );
  });

  it('exposes the full vocabulary without duplicates', () => {
    expect(new Set(AUTOMATION_STOP_REASONS).size).toBe(
      AUTOMATION_STOP_REASONS.length,
    );
  });
});
