import { Module } from '@nestjs/common';
import { EmailMarketingModule } from '../email-marketing/email-marketing.module';
import { PipelineService } from './pipeline.service';
import { LeadAssignmentService } from './lead-assignment.service';
import { Customer360Service } from './customer-360.service';
import { CustomerJourneyService } from './customer-journey.service';
import { AppointmentConflictService } from './appointment-conflict.service';
import { AutomationEngineService } from './automation-engine.service';
import { LeadScoringService } from './lead-scoring.service';
import { FunnelCanvasRuntimeService } from './funnel-canvas-runtime.service';
import { CrmController } from './crm.controller';
import { AuditModule } from '../audit/audit.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EventsModule } from '../events/events.module';
import { AttributionModule } from '../attribution/attribution.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    AuditModule,
    MessagingModule,
    EventsModule,
    AttributionModule,
    EmailMarketingModule,
    CustomersModule,
  ],
  controllers: [CrmController],
  providers: [
    PipelineService,
    LeadAssignmentService,
    Customer360Service,
    CustomerJourneyService,
    AppointmentConflictService,
    AutomationEngineService,
    LeadScoringService,
    FunnelCanvasRuntimeService,
  ],
  exports: [
    PipelineService,
    LeadAssignmentService,
    Customer360Service,
    CustomerJourneyService,
    AppointmentConflictService,
    AutomationEngineService,
    LeadScoringService,
    FunnelCanvasRuntimeService,
  ],
})
export class CrmModule {}
