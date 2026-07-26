import {
  automationRate,
  averageCsat,
  bookingExceptionRate,
  conversionRate,
  qualificationRate,
  type BookingFact,
  type ConversationFact,
  type LeadFact,
  type MetricLineage,
} from '@chai/domain';

export interface OutcomesDashboard {
  automationRate: MetricLineage;
  averageCsat: MetricLineage;
  bookingExceptionRate: MetricLineage;
  conversionRate: MetricLineage;
  qualificationRate: MetricLineage;
  sourceUntil: string;
}

/**
 * Analytics fact port. In-memory seeds back the e2e suite; a DB-backed
 * implementation materializes facts from conversation/lead/booking tables.
 */
export abstract class AnalyticsRepository {
  abstract getOutcomes(tenantId: string): Promise<OutcomesDashboard>;
}

export class InMemoryAnalyticsRepository extends AnalyticsRepository {
  private readonly conversations = new Map<string, ConversationFact[]>();
  private readonly leads = new Map<string, LeadFact[]>();
  private readonly bookings = new Map<string, BookingFact[]>();

  seed(
    tenantId: string,
    data: {
      bookings?: BookingFact[];
      conversations?: ConversationFact[];
      leads?: LeadFact[];
    },
  ): void {
    if (data.conversations) this.conversations.set(tenantId, data.conversations);
    if (data.leads) this.leads.set(tenantId, data.leads);
    if (data.bookings) this.bookings.set(tenantId, data.bookings);
  }

  override async getOutcomes(tenantId: string): Promise<OutcomesDashboard> {
    const sourceUntil = new Date('2026-07-19T00:00:00.000Z');
    const conversationFacts = this.conversations.get(tenantId) ?? [];
    const leadFacts = this.leads.get(tenantId) ?? [];
    const bookingFacts = this.bookings.get(tenantId) ?? [];

    return {
      automationRate: automationRate(conversationFacts, sourceUntil),
      averageCsat: averageCsat(conversationFacts, sourceUntil),
      bookingExceptionRate: bookingExceptionRate(bookingFacts, sourceUntil),
      conversionRate: conversionRate(leadFacts, sourceUntil),
      qualificationRate: qualificationRate(leadFacts, sourceUntil),
      sourceUntil: sourceUntil.toISOString(),
    };
  }
}
