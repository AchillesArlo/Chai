/**
 * Metric lineage core (pure functions). Each KPI records its denominator,
 * source mix (bot/human/blended), and freshness so dashboards can disclose
 * provenance rather than presenting a bare number. GAP-031 requires these
 * predicates resolved before production dashboard use.
 */

export type SourceMix = 'BOT' | 'HUMAN' | 'BLENDED';

export interface MetricLineage {
  denominator: number;
  freshness: { evaluatedAt: Date; sourceUntil: Date };
  mix: SourceMix;
  value: number;
}

export interface ConversationFact {
  aiHandled: boolean;
  endedAt: Date;
  qualified: boolean;
  resolved: boolean;
  satisfactionScore: number | null;
}

export interface LeadFact {
  converted: boolean;
  qualified: boolean;
  stage: string;
}

export interface BookingFact {
  endsAt: Date;
  resourceConflict: boolean;
  startsAt: Date;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
}

function blend(ai: number, human: number): SourceMix {
  if (ai > 0 && human === 0) return 'BOT';
  if (human > 0 && ai === 0) return 'HUMAN';
  return 'BLENDED';
}

export function automationRate(facts: ConversationFact[], sourceUntil: Date): MetricLineage {
  const total = facts.length;
  const aiHandled = facts.filter((fact) => fact.aiHandled).length;
  return {
    denominator: total,
    freshness: { evaluatedAt: new Date(), sourceUntil },
    mix: blend(aiHandled, total - aiHandled),
    value: total === 0 ? 0 : aiHandled / total,
  };
}

export function qualificationRate(leads: LeadFact[], sourceUntil: Date): MetricLineage {
  const total = leads.length;
  const qualified = leads.filter((lead) => lead.qualified).length;
  return {
    denominator: total,
    freshness: { evaluatedAt: new Date(), sourceUntil },
    mix: 'BLENDED',
    value: total === 0 ? 0 : qualified / total,
  };
}

export function conversionRate(leads: LeadFact[], sourceUntil: Date): MetricLineage {
  const total = leads.length;
  const converted = leads.filter((lead) => lead.converted).length;
  return {
    denominator: total,
    freshness: { evaluatedAt: new Date(), sourceUntil },
    mix: 'BLENDED',
    value: total === 0 ? 0 : converted / total,
  };
}

export function averageCsat(facts: ConversationFact[], sourceUntil: Date): MetricLineage {
  const scored = facts.filter(
    (fact) => fact.satisfactionScore !== null && fact.resolved,
  );
  const sum = scored.reduce(
    (acc, fact) => acc + (fact.satisfactionScore as number),
    0,
  );
  return {
    denominator: scored.length,
    freshness: { evaluatedAt: new Date(), sourceUntil },
    mix: blend(
      scored.filter((fact) => fact.aiHandled).length,
      scored.filter((fact) => !fact.aiHandled).length,
    ),
    value: scored.length === 0 ? 0 : sum / scored.length,
  };
}

export function bookingExceptionRate(bookings: BookingFact[], sourceUntil: Date): MetricLineage {
  const total = bookings.length;
  const exceptions = bookings.filter(
    (booking) => booking.status === 'NO_SHOW' || booking.resourceConflict,
  ).length;
  return {
    denominator: total,
    freshness: { evaluatedAt: new Date(), sourceUntil },
    mix: 'BLENDED',
    value: total === 0 ? 0 : exceptions / total,
  };
}
