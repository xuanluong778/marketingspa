import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { LeadAssignmentService } from './lead-assignment.service';
import { Customer360Service } from './customer-360.service';
import { AppointmentConflictService } from './appointment-conflict.service';
import { AutomationEngineService } from './automation-engine.service';
import { CrmController } from './crm.controller';
import { AuditModule } from '../audit/audit.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [AuditModule, MessagingModule],
  controllers: [CrmController],
  providers: [
    PipelineService,
    LeadAssignmentService,
    Customer360Service,
    AppointmentConflictService,
    AutomationEngineService,
  ],
  exports: [
    PipelineService,
    LeadAssignmentService,
    Customer360Service,
    AppointmentConflictService,
    AutomationEngineService,
  ],
})
export class CrmModule {}
