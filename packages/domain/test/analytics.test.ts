import { describe, expect, it } from 'vitest';

import {
  averageCsat,
  automationRate,
  bookingExceptionRate,
  conversionRate,
  qualificationRate,
  type BookingFact,
  type ConversationFact,
  type LeadFact,
} from '../src/analytics';

const SOURCE_UNTIL = new Date('2026-07-18T00:00:00Z');

describe('analytics metric lineage', () => {
  it('automation rate divides AI-handled over total with source mix', () => {
    const facts: ConversationFact[] = [
      { aiHandled: true, endedAt: SOURCE_UNTIL, qualified: true, resolved: true, satisfactionScore: 5 },
      { aiHandled: true, endedAt: SOURCE_UNTIL, qualified: false, resolved: true, satisfactionScore: 4 },
      { aiHandled: false, endedAt: SOURCE_UNTIL, qualified: true, resolved: false, satisfactionScore: null },
    ];
    const metric = automationRate(facts, SOURCE_UNTIL);

    expect(metric.value).toBeCloseTo(2 / 3);
    expect(metric.denominator).toBe(3);
    expect(metric.mix).toBe('BLENDED');
    expect(metric.freshness.sourceUntil).toBe(SOURCE_UNTIL);
  });

  it('marks a fully automated tenant as BOT mix', () => {
    const facts: ConversationFact[] = [
      { aiHandled: true, endedAt: SOURCE_UNTIL, qualified: true, resolved: true, satisfactionScore: 5 },
    ];
    expect(automationRate(facts, SOURCE_UNTIL).mix).toBe('BOT');
  });

  it('returns zero with denominator zero rather than dividing', () => {
    expect(automationRate([], SOURCE_UNTIL).value).toBe(0);
    expect(automationRate([], SOURCE_UNTIL).denominator).toBe(0);
  });

  it('qualification and conversion rates use distinct denominators', () => {
    const leads: LeadFact[] = [
      { converted: false, qualified: true, stage: 'QUALIFIED' },
      { converted: true, qualified: true, stage: 'WON' },
      { converted: false, qualified: false, stage: 'NEW' },
    ];
    expect(qualificationRate(leads, SOURCE_UNTIL).value).toBeCloseTo(2 / 3);
    expect(conversionRate(leads, SOURCE_UNTIL).value).toBeCloseTo(1 / 3);
  });

  it('average CSAT uses only resolved, scored conversations', () => {
    const facts: ConversationFact[] = [
      { aiHandled: true, endedAt: SOURCE_UNTIL, qualified: true, resolved: true, satisfactionScore: 5 },
      { aiHandled: false, endedAt: SOURCE_UNTIL, qualified: true, resolved: true, satisfactionScore: 3 },
      { aiHandled: true, endedAt: SOURCE_UNTIL, qualified: false, resolved: false, satisfactionScore: 4 },
    ];
    const metric = averageCsat(facts, SOURCE_UNTIL);
    expect(metric.value).toBeCloseTo(4);
    expect(metric.denominator).toBe(2);
  });

  it('booking exception rate flags no-shows and resource conflicts', () => {
    const bookings: BookingFact[] = [
      { endsAt: SOURCE_UNTIL, resourceConflict: false, startsAt: SOURCE_UNTIL, status: 'COMPLETED' },
      { endsAt: SOURCE_UNTIL, resourceConflict: true, startsAt: SOURCE_UNTIL, status: 'CONFIRMED' },
      { endsAt: SOURCE_UNTIL, resourceConflict: false, startsAt: SOURCE_UNTIL, status: 'NO_SHOW' },
    ];
    const metric = bookingExceptionRate(bookings, SOURCE_UNTIL);
    expect(metric.value).toBeCloseTo(2 / 3);
  });
});
