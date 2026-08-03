import { Inject, Injectable } from '@nestjs/common';

import { withTenantTransaction, type Database } from '@chai/database';
import {
  automationRate,
  averageCsat,
  bookingExceptionRate,
  conversionRate,
  inboundMessageVolume,
  newConversationRate,
  qualificationRate,
  readMessageFacts,
  type BookingFact,
  type ConversationFact,
  type LeadFact,
} from '@chai/domain';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';
import type {
  MessageOutcomesDashboard,
  OutcomesDashboard,
} from './analytics.repository';
import { AnalyticsRepository } from './analytics.repository';

interface ConversationRow {
  mode: string;
  resolved_at: Date | null;
  status: string;
  last_message_at: Date;
}

interface LeadRow {
  stage: string;
  status: string;
}

interface BookingRow {
  ends_at: Date;
  starts_at: Date;
  status: string;
}

/**
 * Materializes pure analytics facts from live conversation/lead/appointment rows.
 * CSAT is null until a score column exists (ponytail: add when product stores it).
 */
@Injectable()
export class PostgresAnalyticsRepository extends AnalyticsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async getOutcomes(tenantId: string): Promise<OutcomesDashboard> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const conversations = await tx<ConversationRow[]>`
          SELECT mode, status, resolved_at, last_message_at
          FROM chai.conversation
        `;
        const leads = await tx<LeadRow[]>`
          SELECT stage, status FROM chai.lead
        `;
        const bookings = await tx<BookingRow[]>`
          SELECT status, starts_at, ends_at FROM chai.appointment
        `;

        const sourceUntil = new Date();
        const conversationFacts: ConversationFact[] = conversations.map((row) => ({
          aiHandled: row.mode === 'AI_ACTIVE',
          endedAt: row.resolved_at ?? row.last_message_at,
          qualified: false,
          resolved: row.status === 'RESOLVED' || row.status === 'CLOSED',
          satisfactionScore: null,
        }));
        const leadFacts: LeadFact[] = leads.map((row) => ({
          converted: row.status === 'CONVERTED' || row.stage === 'WON',
          qualified: ['QUALIFIED', 'BOOKED', 'WON'].includes(row.stage),
          stage: row.stage,
        }));
        const bookingFacts: BookingFact[] = bookings.map((row) => ({
          endsAt: row.ends_at,
          resourceConflict: false,
          startsAt: row.starts_at,
          status: this.mapBookingStatus(row.status),
        }));

        return {
          automationRate: automationRate(conversationFacts, sourceUntil),
          averageCsat: averageCsat(conversationFacts, sourceUntil),
          bookingExceptionRate: bookingExceptionRate(bookingFacts, sourceUntil),
          conversionRate: conversionRate(leadFacts, sourceUntil),
          qualificationRate: qualificationRate(leadFacts, sourceUntil),
          sourceUntil: sourceUntil.toISOString(),
        };
      },
    );
  }

  override async getMessageOutcomes(
    tenantId: string,
    sourceUntil: Date = new Date(),
  ): Promise<MessageOutcomesDashboard> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        // Reads the fact table, not chai.message — analytics stays off the
        // operational path (FASE 32). The facts are populated by the FASE 30
        // consumer of `message.received`.
        const facts = await readMessageFacts(tx);
        return {
          inboundMessageVolume: inboundMessageVolume(facts, sourceUntil),
          newConversationRate: newConversationRate(facts, sourceUntil),
          sourceUntil: sourceUntil.toISOString(),
        };
      },
    );
  }

  private mapBookingStatus(
    status: string,
  ): BookingFact['status'] {
    if (
      status === 'CONFIRMED' ||
      status === 'CANCELLED' ||
      status === 'COMPLETED' ||
      status === 'NO_SHOW'
    ) {
      return status;
    }
    // RESCHEDULED etc. → treat as confirmed for exception rate.
    return 'CONFIRMED';
  }
}
