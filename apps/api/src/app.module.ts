import {
  Module,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthModule, AUDIENCE_GUARD } from './auth/auth.module';
import { EntitlementModule } from './modules/entitlements/entitlement.module';
import { ApiErrorFilter } from './common/error.filter';
import { IdempotencyKeyInterceptor } from './common/idempotency.interceptor';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { TenantContextInterceptor } from './common/tenant-context.interceptor';
import { TracingInterceptor } from './common/tracing.interceptor';
import { AuthorizationGuard } from './guards/authorization.guard';
import { EntitlementGuard } from './guards/entitlement.guard';
import { HealthController } from './health/health.controller';
import { DatabaseModule } from './database/database.module';
import { ActionsModule } from './modules/actions/actions.module';
import { AIAgentModule } from './modules/ai-agent/ai-agent.module';
import { AdvancedAnalyticsModule } from './modules/advanced-analytics/advanced-analytics.module';
import { AdvancedLogisticsModule } from './modules/advanced-logistics/advanced-logistics.module';
import { AdvancedPaymentsModule } from './modules/advanced-payments/advanced-payments.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { AttachmentModule } from './modules/attachment/attachment.module';
import { AuditModule } from './modules/audit/audit.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AutomationBuilderModule } from './modules/automation-builder/automation-builder.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { ContactSegmentModule } from './modules/contact-segment/contact-segment.module';
import { EnterpriseModule } from './modules/enterprise/enterprise.module';
import { IamModule } from './modules/iam/iam.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { LeadsModule } from './modules/leads/leads.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { MultiRegionModule } from './modules/multi-region/multi-region.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { PartnerEcosystemModule } from './modules/partner-ecosystem/partner-ecosystem.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { QuarantineModule } from './modules/quarantine/quarantine.module';
import { RetentionModule } from './modules/retention/retention.module';
import { SLAModule } from './modules/sla/sla.module';
import { TemplateModule } from './modules/template/template.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { WhitelabelModule } from './modules/whitelabel/whitelabel.module';
import { WidgetModule } from './modules/widget/widget.module';
import { ConnectorConfigModule } from './modules/connector-config/connector-config.module';
import { DlqModule } from './modules/dlq/dlq.module';
import { ImpersonationModule } from './modules/impersonation/impersonation.module';
import { AuditImmutabilityModule } from './modules/audit-immutability/audit-immutability.module';

@Module({
  controllers: [HealthController],
  imports: [
    DatabaseModule,
    EntitlementModule,
    AuthModule,
    ActionsModule,
    AIAgentModule,
    AdvancedAnalyticsModule,
    AdvancedLogisticsModule,
    AdvancedPaymentsModule,
    AnalyticsModule,
    AssignmentModule,
    AttachmentModule,
    AuditModule,
    AutomationModule,
    AutomationBuilderModule,
    CalendarModule,
    CampaignModule,
    ChannelsModule,
    ContactSegmentModule,
    EnterpriseModule,
    IamModule,
    KnowledgeModule,
    LeadsModule,
    LogisticsModule,
    MarketplaceModule,
    MultiRegionModule,
    NotificationModule,
    ObservabilityModule,
    PartnerEcosystemModule,
    PaymentsModule,
    QuarantineModule,
    RetentionModule,
    SLAModule,
    TemplateModule,
    TicketModule,
    WhitelabelModule,
    WidgetModule,
    ConnectorConfigModule,
    ImpersonationModule,
    AuditImmutabilityModule,
    DlqModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AUDIENCE_GUARD },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_GUARD, useClass: EntitlementGuard },
    // Outermost interceptor: everything below runs inside the request span.
    { provide: APP_INTERCEPTOR, useClass: TracingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyKeyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class AppModule {}
