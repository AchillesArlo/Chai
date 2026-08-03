import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { EntitlementModule } from '../entitlements/entitlement.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LeadsModule } from '../leads/leads.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { PaymentsModule } from '../payments/payments.module';
import {
  ActionAppointmentPort,
  ActionKnowledgePort,
  ActionPaymentPort,
  ActionShipmentPort,
} from '../shared/action-tool.port';
import { ActionsController } from './actions.controller';
import { ActionsRepository, InMemoryActionsRepository } from './actions.repository';
import { PostgresActionsRepository } from './postgres-actions.repository';

@Module({
  controllers: [ActionsController],
  imports: [EntitlementModule, KnowledgeModule, LeadsModule, LogisticsModule, PaymentsModule],
  providers: [
    {
      provide: ActionsRepository,
      inject: [DATABASE, ActionKnowledgePort, ActionAppointmentPort, ActionShipmentPort, ActionPaymentPort],
      useFactory: (
        database: DatabaseHandle,
        knowledge: ActionKnowledgePort,
        appointments: ActionAppointmentPort,
        shipments: ActionShipmentPort,
        payments: ActionPaymentPort,
      ): ActionsRepository => {
        if (database) {
          return new PostgresActionsRepository(database, knowledge, appointments, shipments, payments);
        }
        // ponytail: e2e / local without DATABASE_URL stays in-memory.
        return new InMemoryActionsRepository({ appointments, knowledge, payments, shipments });
      },
    },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class ActionsModule {}
