import {
  automationRate,
  averageCsat,
  bookingExceptionRate,
  conversionRate,
  inboundMessageVolume,
  newConversationRate,
  qualificationRate,
  type BookingFact,
  type ConversationFact,
  type LeadFact,
  type MessageFact,
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
 * Message KPIs derived from chai.message_fact (FASE 32) rather than the
 * operational chai.message — analytics reads never touch the transactional path.
 */
export interface MessageOutcomesDashboard {
  inboundMessageVolume: MetricLineage;
  newConversationRate: MetricLineage;
  sourceUntil: string;
}

/**
 * Analytics fact port. In-memory seeds back the e2e suite; a DB-backed
 * implementation materializes facts from conversation/lead/booking tables.
 */
export abstract class AnalyticsRepository {
  abstract getOutcomes(tenantId: string): Promise<OutcomesDashboard>;

  /**
   * Message KPIs from the fact table. `sourceUntil` is a parameter, not a baked
   * constant, so a caller can evaluate the window it means to disclose.
   */
  abstract getMessageOutcomes(
    tenantId: string,
    sourceUntil?: Date,
  ): Promise<MessageOutcomesDashboard>;
}

export class InMemoryAnalyticsRepository extends AnalyticsRepository {
  private readonly conversations = new Map<string, ConversationFact[]>();
  private readonly leads = new Map<string, LeadFact[]>();
  private readonly bookings = new Map<string, BookingFact[]>();
  private readonly messages = new Map<string, MessageFact[]>();

  seed(
    tenantId: string,
    data: {
      bookings?: BookingFact[];
      conversations?: ConversationFact[];
      leads?: LeadFact[];
      messages?: MessageFact[];
    },
  ): void {
    if (data.conversations) this.conversations.set(tenantId, data.conversations);
    if (data.leads) this.leads.set(tenantId, data.leads);
    if (data.bookings) this.bookings.set(tenantId, data.bookings);
    if (data.messages) this.messages.set(tenantId, data.messages);
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

  override async getMessageOutcomes(
    tenantId: string,
    sourceUntil: Date = new Date(),
  ): Promise<MessageOutcomesDashboard> {
    const facts = this.messages.get(tenantId) ?? [];
    return {
      inboundMessageVolume: inboundMessageVolume(facts, sourceUntil),
      newConversationRate: newConversationRate(facts, sourceUntil),
      sourceUntil: sourceUntil.toISOString(),
    };
  }
}
